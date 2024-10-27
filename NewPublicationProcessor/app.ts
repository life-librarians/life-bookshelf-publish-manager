import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { awsS3BucketName, databaseConfig, firebaseAdminKey } from './config';
import { discordConfig } from './config';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import { BookChapter, NotionDatabaseProperties, PublicationNotice, PublishStatus } from './types';
import { getBookChaptersAndContents, getDeviceTokens, getMemberBookPublicationDetails } from './query';
import admin from 'firebase-admin';
import { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints';

function formatBookDetails(chapters: BookChapter[]): string {
  let resultString = 'Book Details:\n';

  chapters.forEach((chapter) => {
    resultString += `\nChapter ${chapter.chapterNumber}: ${chapter.chapterName}\n`;
    chapter.contents.forEach((content) => {
      resultString += `  Page ${content.pageNumber}: ${content.pageContent}\n`;
    });
  });

  return resultString;
}

// Function to split long content into chunks of 2000 characters
function splitContentIntoChunks(content: string, chunkSize = 2000) {
  return content.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
}

function publishStatusToKorean(status: PublishStatus): string {
  switch (status) {
    case PublishStatus.REQUESTED:
      return '새 요청';
    case PublishStatus.REQUEST_CONFIRMED:
      return '요청 처리중';
    case PublishStatus.IN_PUBLISHING:
      return '출판 중';
    case PublishStatus.PUBLISHED:
      return '출판 완료';
    case PublishStatus.REJECTED:
      return '출판 반려';
  }
}

async function getFullImageUrl(objectKey: string): Promise<string | null> {
  const s3Url = 's3.ap-northeast-2.amazonaws.com';
  const bucketName = awsS3BucketName;
  const url = `https://${s3Url}/${bucketName}/${objectKey}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.status === 200) {
      return url; // Image exists and is accessible
    }
    return null; // Image does not exist or is not accessible
  } catch (error) {
    return null; // Network error or other issue
  }
}

async function sendFCMPushNotification(publicationNotices: PublicationNotice[]): Promise<void> {
  const decodedConfig = Buffer.from(firebaseAdminKey, 'base64').toString('utf8');
  const config = JSON.parse(decodedConfig);

  admin.initializeApp({
    credential: admin.credential.cert(config),
  });

  const messages = await Promise.all(
    publicationNotices.map(async (notice) => {
      const imageUrl = await getFullImageUrl(notice.bookCoverImageUrl);
      return {
        notification: {
          title: '출판 요청 접수 알림',
          body: `${notice.memberName}님의 책 "${notice.bookTitle}"의 출판 요청이 접수되었습니다.`,
          ...(imageUrl && { imageUrl }), // Include imageUrl only if it exists
        },
        token: notice.deviceToken,
      };
    }),
  );

  console.log('Sending messages:', messages);

  const result = await admin.messaging().sendEach(messages);

  console.log('Result:', result);
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

    const memberBookPublicationDetail = await getMemberBookPublicationDetails(
      connection,
      requestBody.publicationId as number,
    );

    console.log(memberBookPublicationDetail);

    const bookChaptersAndContents = await getBookChaptersAndContents(connection, memberBookPublicationDetail.bookId);
    console.log(bookChaptersAndContents);
    const formattedBookDetails = formatBookDetails(bookChaptersAndContents);

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

    // await webhook.send(message);

    const deviceTokens = await getDeviceTokens(connection, memberBookPublicationDetail.memberEmail);
    const publicationNotices: PublicationNotice[] = deviceTokens.map((deviceToken) => ({
      publicationId: memberBookPublicationDetail.publicationId,
      memberName: memberBookPublicationDetail.memberName,
      bookTitle: memberBookPublicationDetail.bookTitle,
      bookCoverImageUrl: memberBookPublicationDetail.bookCoverImageUrl,
      publishStatus: memberBookPublicationDetail.publishStatus,
      deviceToken,
    }));

    await sendFCMPushNotification(publicationNotices);

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
    if (connection) await connection.end();
  }
};
