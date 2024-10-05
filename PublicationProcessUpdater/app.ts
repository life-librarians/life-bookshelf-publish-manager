import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
// import { databaseConfig } from './config';
// import { policyConfig } from './config';
// import { discordConfig } from './config';
import { notionConfig } from './config';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import { Client } from '@notionhq/client';

export const lambdaHandler = async (_: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // const pool = mariadb.createPool(databaseConfig);
  // const webhook = new Webhook(discordConfig.webhookUrl as string);
  // let connection;
  try {
    const notion = new Client({ auth: notionConfig.apiKey });
    const databaseId = notionConfig.databaseId;

    const response = await notion.databases.query({
      database_id: databaseId,
      // sorts: [
      //     {
      //         property: '출판 요청일',
      //         direction: 'descending',
      //     },
      // ],
    });

    // console.log(response.results);

    const results = response.results;
    for (const result of results) {
      console.log(result);
      // @ts-ignore
      const properties = result.properties;
      const name = properties['고객명']['title'][0]['text']['content'];
      const title = properties['책 제목']['rich_text'][0]['text']['content'];
      const publishStatus = properties['출판 상태']['select']['name'];
      const willPublish = properties['예상 출판일']['date']['start'];
      const requestedAt = properties['출판 요청일']['date']['start'];
      const publishedAt = properties['출판일']['date']['start'];
      const pageCount = properties['페이지 수']['number'];

      console.log('고객명: ', name);
      console.log('책 제목: ', title);
      console.log('출판 상태: ', publishStatus);
      console.log('예상 출판일: ', willPublish);
      console.log('출판 요청일: ', requestedAt);
      console.log('출판일: ', publishedAt);
      console.log('페이지 수: ', pageCount);
    }

    //     connection = await pool.getConnection();
    //     const membersToDelete = await connection.query(`
    //         SELECT * FROM member WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ${policyConfig.cleanupInterval} DAY)
    //     `);
    //     for (const member of membersToDelete) {
    //         try {
    //             await connection.commit();
    //         } catch (error) {
    //             console.error(error);
    //             console.error(`Failed to delete member: ${member}`);
    //             // Discord webhook으로 에러 알림
    //             const embed = new MessageBuilder()
    //                 .setTitle('[회원 삭제 스케줄러] 회원 영구 삭제 실패')
    //                 .setDescription('회원 영구 삭제 중 오류가 발생했습니다.')
    //                 .addField('대상 회원', JSON.stringify(member))
    //                 .addField('에러 메시지', error instanceof Error ? error.message : JSON.stringify(error))
    //                 .setTimestamp();
    //             await webhook.send(embed);
    //         } finally {
    //         }
    //     }
    return {
      statusCode: 200,
      body: JSON.stringify({}),
    };
  } catch (error) {
    console.error('Error:', error);
    //     if (connection) await connection.rollback();
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to delete members and their related data' }),
    };
  } finally {
    // if (connection) await connection.end();
  }
};
