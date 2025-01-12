import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mariadb from 'mariadb';
import { awsS3BucketName, databaseConfig, policyConfig } from './config';
import { discordConfig } from './config';
import { Webhook, MessageBuilder } from 'discord-webhook-node';
import { deleteMemberByMemberIdTransaction, findMembersByDeletedAt, Member } from './query';

async function sendWebhook(members: Member[]) {
  try {
    const webhook = new Webhook(discordConfig.webhookUrl as string);
    let message: MessageBuilder = new MessageBuilder();
    if (members.length === 0) {
      console.log('No members to delete');

      message.setTitle('탈퇴한 회원이 없습니다.').setDescription('삭제할 회원이 없습니다.').setColor(0).setTimestamp();
    } else {
      message
        .setTitle('탈퇴한 회원 삭제를 진행합니다.')
        .setDescription(`총 ${members.length}명의 회원이 삭제됩니다.`)
        .setColor(0)
        .setTimestamp();

      for (const member of members) {
        message.addField(
          '삭제될 회원',
          `ID: ${member.id}
          Name: ${member.name}
          Email: ${member.email}
          DeletedAt: ${member.deletedAt}`,
        );
      }
    }
    await webhook.send(message);
  } catch (error) {
    console.error('Error sending webhook:', error);
  }
}

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', event);
  let connection: mariadb.PoolConnection | null = null;

  try {
    console.log(databaseConfig);
    const pool = mariadb.createPool(databaseConfig);
    connection = await pool.getConnection();

    console.log('Connected to MariaDB');

    // ========= BEGIN TRANSACTION =========
    connection.beginTransaction();

    console.log('Finding members to delete...');

    let willBeDeletedMembers = await findMembersByDeletedAt(connection);

    // 오늘 날짜로부터 탈퇴한 날짜가 policyConfig.maxWithdrawalDays 이상인 회원만 삭제 대상으로 선정
    const today = new Date();
    willBeDeletedMembers = willBeDeletedMembers.filter((member) => {
      const deletedAt = member.deletedAt;
      const diffDays = Math.floor((today.getTime() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= policyConfig.maxWithdrawalDays;
    });

    await sendWebhook(willBeDeletedMembers);

    for (const member of willBeDeletedMembers) {
      const memberForLog = { ...member, id: member.id.toString() };
      console.log(`Deleting member: ${JSON.stringify(memberForLog)}`);
      await deleteMemberByMemberIdTransaction(connection, member.id);
    }

    console.log(`Deleted [${willBeDeletedMembers.length}] members`);

    await connection.commit();
    // ========= END TRANSACTION =========

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Successfully deleted [${willBeDeletedMembers.length}] members`,
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
