import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { awsS3BucketName, databaseConfig, firebaseAdminKey } from './config';
import { discordConfig } from './config';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import { NoticeHistoryRequest, NotionMemberBookPublication, PublicationNotice, UpdatePublication } from './types';
import {
  addNoticeHistories,
  getAllMemberBookPublicationDetails,
  queryNotionDatabase,
  updatePublications,
} from './query';
import admin from 'firebase-admin';
import { getPushNotificationContent } from './utils';

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

async function sendWebhook(
  newPublications: UpdatePublication[],
  notionMemberBookPublicationDetails: NotionMemberBookPublication[],
) {
  try {
    const webhook = new Webhook(discordConfig.webhookUrl as string);

    const message = new MessageBuilder()
      .setTitle('노션 데이터베이스 변경이 반영되었습니다')
      .setDescription(`총 ${newPublications.length}개의 출판물이 처리되었습니다.`)
      .addField('총 출판물 수', `${notionMemberBookPublicationDetails.length}개`)
      .addField('변경된 출판물', '```' + JSON.stringify(newPublications, null, 2) + '```')
      .setColor(0)
      .setTimestamp();

    await webhook.send(message);
  } catch (error) {
    console.error('Error sending webhook:', error);
  }
}

async function sendFCMPushNotification(publicationNotices: PublicationNotice[]): Promise<NoticeHistoryRequest[]> {
  const decodedConfig = Buffer.from(firebaseAdminKey, 'base64').toString('utf8');
  const config = JSON.parse(decodedConfig);

  admin.initializeApp({
    credential: admin.credential.cert(config),
  });

  const noticeHistories: NoticeHistoryRequest[] = [];

  const messages = await Promise.all(
    publicationNotices.map(async (notice) => {
      const imageUrl = notice.bookCoverImageUrl.includes('https://')
        ? notice.bookCoverImageUrl
        : await getFullImageUrl(notice.bookCoverImageUrl);

      const { title, body: content } = getPushNotificationContent(notice.publishStatus);
      const message = {
        notification: {
          title,
          body: content,
          ...(imageUrl && { imageUrl }), // Include imageUrl only if it exists
        },
        token: notice.deviceToken,
      };
      noticeHistories.push({
        memberId: notice.memberId,
        title,
        content,
      });
      return message;
    }),
  );

  console.log('Sending messages:', messages);
  const response = await admin.messaging().sendEach(messages);
  console.log('FCM response:', response);

  return noticeHistories;
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let connection: mariadb.PoolConnection | null = null;

  try {
    const pool = mariadb.createPool(databaseConfig);
    connection = await pool.getConnection();

    // ========= BEGIN TRANSACTION =========
    connection.beginTransaction();
    const memberBookPublicationDetails = await getAllMemberBookPublicationDetails(connection);

    const notion = new Client({ auth: notionConfig.apiKey });
    const notionMemberBookPublicationDetails = await queryNotionDatabase(notion);

    const newPublications: UpdatePublication[] = [];
    const publicationNotices: PublicationNotice[] = [];

    for (const notionPublication of notionMemberBookPublicationDetails) {
      const publication = memberBookPublicationDetails.find(
        (publication) => publication.publicationId === notionPublication.publicationId,
      );
      if (publication) {
        if (
          publication.publishStatus !== notionPublication.publishStatus ||
          publication.publishedAt !== notionPublication.publishedAt
        ) {
          const newPublication: UpdatePublication = {
            publicationId: notionPublication.publicationId,
            newPublishStatus: notionPublication.publishStatus,
            newPublishedAt: notionPublication.publishedAt,
            previousPublishStatus: publication.publishStatus,
            previousPublishedAt: publication.publishedAt,
          };
          newPublications.push(newPublication);
          publicationNotices.push({
            publicationId: notionPublication.publicationId,
            memberId: publication.memberId,
            memberName: notionPublication.memberName,
            bookTitle: notionPublication.bookTitle,
            bookCoverImageUrl: notionPublication.bookCoverImageUrl,
            publishStatus: notionPublication.publishStatus,
            deviceToken: publication.deviceToken,
          });
          console.log(`Publication [${JSON.stringify(newPublication)}] Will be Updated ...`);
        }
      }
    }
    if (newPublications.length === 0) {
      console.log('No publications to update');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No publications to update' }),
      };
    }

    await updatePublications(connection, newPublications);
    console.log(`Successfully updated [${newPublications.length}] publications`);

    const noticeHistories = await sendFCMPushNotification(publicationNotices);
    await connection.commit();
    // ========= END TRANSACTION =========

    await sendWebhook(newPublications, notionMemberBookPublicationDetails);

    try {
      await addNoticeHistories(connection, noticeHistories);
      console.log('Notice history added successfully');
    } catch (error) {
      console.error('Error adding notice history:', error);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully updated [${newPublications.length}] publications`,
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
