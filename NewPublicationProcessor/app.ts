import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { databaseConfig, firebaseAdminKey } from './config';
import { discordConfig } from './config';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import {
  BookChapter,
  MemberBookPublication,
  NoticeHistoryRequest,
  NotionDatabaseProperties,
  PublicationNotice,
} from './types';
import {
  addNoticeHistory,
  getBookChaptersAndContents,
  getDeviceTokens,
  getMemberBookPublicationDetails,
} from './query';
import admin from 'firebase-admin';
import { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';
import { getFullImageUrl, publishStatusToKorean } from './utils';
import { sendEmail } from './mailer';

// Function to split long content into chunks of 2000 characters
function splitContentIntoChunks(content: string, chunkSize = 2000) {
  return content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
}

async function sendFCMPushNotification(publicationNotices: PublicationNotice[]): Promise<NoticeHistoryRequest | null> {
  if (publicationNotices.length === 0) {
    console.log('No publication notices to send.');
    return null;
  }

  const decodedConfig = Buffer.from(firebaseAdminKey, 'base64').toString('utf8');
  const config = JSON.parse(decodedConfig);

  admin.initializeApp({
    credential: admin.credential.cert(config),
  });

  const title = '출판 요청 접수 알림';
  const body = `${publicationNotices[0].memberName}님의 책 "${publicationNotices[0].bookTitle}"의 출판 요청이 접수되었습니다.`;

  const validNotices = publicationNotices.filter((notice) => notice.deviceToken); // deviceToken이 존재하는 경우만 처리

  if (validNotices.length === 0) {
    console.log('No valid device tokens found.');
    return null;
  }

  const messages = await Promise.all(
    validNotices.map(async (notice) => {
      const imageUrl = await getFullImageUrl(notice.bookCoverImageUrl);
      return {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }), // Include imageUrl only if it exists
        },
        token: notice.deviceToken!,
      };
    }),
  );

  console.log('Sending messages:', messages);
  const result = await admin.messaging().sendEach(messages);
  console.log('Result:', result);

  return {
    memberId: publicationNotices[0].memberId,
    title,
    content: body,
  } as NoticeHistoryRequest;
}

async function sendWebhook(memberBookPublicationDetail: MemberBookPublication): Promise<void> {
  try {
    const webhook = new Webhook(discordConfig.webhookUrl as string);
    const message = new MessageBuilder()
      .setTitle('새 출판 요청이 처리되었습니다')
      .setDescription(`Publication ID: ${memberBookPublicationDetail.publicationId}`)
      .addField('Book Title', memberBookPublicationDetail.bookTitle)
      .addField('Member Name', memberBookPublicationDetail.memberName)
      .addField('Member Email', memberBookPublicationDetail.memberEmail)
      .addField('Publication Status', publishStatusToKorean(memberBookPublicationDetail.publishStatus))
      .addField('Published At', memberBookPublicationDetail.publishedAt?.toISOString() || 'N/A')
      .setColor(0)
      .setTimestamp();
    await webhook.send(message);
  } catch (error) {
    console.error('Error sending Discord webhook:', error);
  }
}

async function addNotionBlock(
  memberBookPublicationDetail: MemberBookPublication,
  bookChaptersAndContents: BookChapter[],
  notion: Client,
  databaseId: string,
): Promise<void> {
  const properties: Partial<NotionDatabaseProperties> = {};
  properties['출판 ID'] = { number: memberBookPublicationDetail.publicationId };
  properties.고객명 = { title: [{ text: { content: memberBookPublicationDetail.memberName } }] };
  properties['고객 이메일'] = { email: memberBookPublicationDetail.memberEmail };
  properties['책 제목'] = { rich_text: [{ text: { content: memberBookPublicationDetail.bookTitle } }] };
  properties['페이지 수'] = { number: memberBookPublicationDetail.bookPageCount };
  properties['책 커버 이미지 주소'] = {
    url: (await getFullImageUrl(memberBookPublicationDetail.bookCoverImageUrl)) as string,
  };
  properties['가격(원)'] = { number: memberBookPublicationDetail.publicationPrice };
  properties['출판 요청일'] = {
    date: { start: memberBookPublicationDetail.publicationRequestedAt.toISOString() },
  };
  properties['예상 출판일'] = { date: { start: memberBookPublicationDetail.willPublishedAt.toISOString() } };
  properties['출판 상태'] = {
    select: { name: publishStatusToKorean(memberBookPublicationDetail.publishStatus) },
  };

  const children: BlockObjectRequest[] = [];

  bookChaptersAndContents.forEach((chapter) => {
    // Add Chapter title as H1
    children.push({
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `Chapter ${chapter.chapterNumber}: ${chapter.chapterName}`,
            },
          },
        ],
      },
    });

    chapter.contents.forEach((content) => {
      // Add Page title as H2
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Page ${content.pageNumber}`,
              },
            },
          ],
        },
      });

      // Split page content into 2000-character chunks and add as paragraph blocks
      const chunks = splitContentIntoChunks(content.pageContent);
      chunks.forEach((chunk) => {
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: chunk,
                },
              },
            ],
          },
        });
      });
    });
  });

  // Send to Notion API
  const response = await notion.pages.create({
    parent: {
      database_id: databaseId,
    },
    properties,
    children,
  });
  console.log('Notion response:', response);
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let connection: mariadb.PoolConnection | null = null;

  try {
    console.log('Full event:', JSON.stringify(event, null, 2));
    let requestBody;
    if (typeof event.body === 'string') {
      try {
        requestBody = JSON.parse(event.body);
      } catch (parseError) {
        console.error('Error parsing event.body:', parseError);
        requestBody = event.body; // 파싱 실패 시 원본 문자열 사용
      }
    } else if (typeof event.body === 'object') {
      requestBody = event.body; // 이미 객체인 경우 그대로 사용
    } else {
      throw new Error('Unexpected event.body type');
    }

    const pool = mariadb.createPool(databaseConfig);
    const notion = new Client({ auth: notionConfig.apiKey });
    const databaseId = notionConfig.databaseId;

    connection = await pool.getConnection();

    connection.beginTransaction();
    // ============ BEGIN PUBLICATION TRANSACTION ============
    const memberBookPublicationDetail = await getMemberBookPublicationDetails(
      connection,
      requestBody.publicationId as number,
    );

    console.log(memberBookPublicationDetail);

    const bookChaptersAndContents = await getBookChaptersAndContents(connection, memberBookPublicationDetail.bookId);
    console.log(bookChaptersAndContents);

    await addNotionBlock(memberBookPublicationDetail, bookChaptersAndContents, notion, databaseId);

    await sendWebhook(memberBookPublicationDetail);

    const deviceTokens = await getDeviceTokens(connection, memberBookPublicationDetail.memberEmail);
    const publicationNotices: PublicationNotice[] = deviceTokens.map((deviceToken) => ({
      publicationId: memberBookPublicationDetail.publicationId,
      memberId: memberBookPublicationDetail.memberId,
      memberName: memberBookPublicationDetail.memberName,
      bookTitle: memberBookPublicationDetail.bookTitle,
      bookCoverImageUrl: memberBookPublicationDetail.bookCoverImageUrl,
      publishStatus: memberBookPublicationDetail.publishStatus,
      deviceToken,
    }));

    await sendEmail(memberBookPublicationDetail);
    connection.commit();
    // ============ END PUBLICATION TRANSACTION ============

    const noticeHistoryRequest = await sendFCMPushNotification(publicationNotices);
    try {
      if (noticeHistoryRequest) {
        await addNoticeHistory(connection, noticeHistoryRequest);
      }
      console.log('Notice history added successfully');
    } catch (error) {
      console.error('Error adding notice history:', error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Publication processed successfully: ${memberBookPublicationDetail.publicationId}`,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    if (connection) await connection.rollback();
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};
