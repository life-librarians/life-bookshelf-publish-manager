import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { databaseConfig } from './config';
import { discordConfig } from './config';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import { UpdatePublication } from './types';
import { getAllMemberBookPublicationDetails, queryNotionDatabase, updatePublication } from './query';

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let connection: mariadb.PoolConnection | null = null;

  try {
    const pool = mariadb.createPool(databaseConfig);
    connection = await pool.getConnection();

    const memberBookPublicationDetails = await getAllMemberBookPublicationDetails(connection);

    const notion = new Client({ auth: notionConfig.apiKey });
    const notionMemberBookPublicationDetails = await queryNotionDatabase(notion);

    const newPublications: UpdatePublication[] = [];

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

          await updatePublication(connection, newPublication);
          console.log(`Updated publication [${JSON.stringify(newPublication)}]`);
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

    const webhook = new Webhook(discordConfig.webhookUrl as string);

    const message = new MessageBuilder()
      .setTitle('노션 데이터베이스 변경이 반영되었습니다')
      .setDescription(`총 ${newPublications.length}개의 출판물이 처리되었습니다.`)
      .addField('총 출판물 수', `${notionMemberBookPublicationDetails.length}개`)
      .addField('변경된 출판물', '```' + JSON.stringify(newPublications, null, 2) + '```')
      .setColor(0)
      .setTimestamp();

    await webhook.send(message);

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
