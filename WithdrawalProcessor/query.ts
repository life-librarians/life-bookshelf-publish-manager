import mariadb from 'mariadb';

// ================= Start of Mariadb Query Functions =================

async function deleteNotificationsByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM notification_subscribes WHERE member_id = ?', [memberId]);
  await connection.query('DELETE FROM notice_histories WHERE member_id = ?', [memberId]);
}

async function deleteMemberMetadataByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM member_metadatas WHERE member_id = ?', [memberId]);
}

async function deleteLikeesByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM likees WHERE member_id = ?', [memberId]);
}

async function deleteInterviewByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query(
    'DELETE FROM conversations WHERE interview_id IN (SELECT id FROM interviews WHERE member_id = ?)',
    [memberId],
  );

  await connection.query('UPDATE interviews SET current_question_id = NULL WHERE member_id = ?', [memberId]);

  await connection.query(
    'DELETE FROM interview_questions WHERE interview_id IN (SELECT id FROM interviews WHERE member_id = ?)',
    [memberId],
  );
  await connection.query('DELETE FROM interviews WHERE member_id = ?', [memberId]);
}

async function deleteDeviceRegistryByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM device_registries WHERE member_id = ?', [memberId]);
}

async function deleteCommentsByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM comments WHERE member_id = ?', [memberId]);
}

async function deleteAutobiographiesByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query('DELETE FROM autobiographies WHERE member_id = ?', [memberId]);
  await connection.query('DELETE FROM chapter_statuses WHERE member_id = ?', [memberId]);
  await connection.query('DELETE FROM chapters WHERE member_id = ?', [memberId]);
}

async function deleteBooksByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  await connection.query(
    'DELETE FROM book_contents WHERE book_chapter_id IN (SELECT id FROM book_chapters WHERE book_id IN (SELECT id FROM books WHERE member_id = ?))',
    [memberId],
  );

  await connection.query('DELETE FROM book_chapters WHERE book_id IN (SELECT id FROM books WHERE member_id = ?)', [
    memberId,
  ]);

  await connection.query('DELETE FROM publications WHERE book_id IN (SELECT id FROM books WHERE member_id = ?)', [
    memberId,
  ]);

  await connection.query('DELETE FROM books WHERE member_id = ?', [memberId]);
}

async function deleteMemberByMemberId(connection: mariadb.PoolConnection, memberId: number): Promise<void> {
  // member의 social_member_id를 찾아서 null로 만들어준다.
  await connection.query('UPDATE members SET social_member_id = NULL WHERE id = ?', [memberId]);
  // member의 password_member_id를 찾아서 null로 만들어준다.
  await connection.query('UPDATE members SET password_member_id = NULL WHERE id = ?', [memberId]);

  await connection.query('DELETE FROM social_members WHERE id = (SELECT social_member_id FROM members WHERE id = ?)', [
    memberId,
  ]);

  await connection.query(
    'DELETE FROM password_members WHERE id = (SELECT password_member_id FROM members WHERE id = ?)',
    [memberId],
  );

  await connection.query('DELETE FROM members WHERE id = ?', [memberId]);
}

export async function deleteMemberByMemberIdTransaction(
  connection: mariadb.PoolConnection,
  memberId: number,
): Promise<void> {
  await deleteNotificationsByMemberId(connection, memberId);
  await deleteMemberMetadataByMemberId(connection, memberId);
  await deleteLikeesByMemberId(connection, memberId);
  await deleteInterviewByMemberId(connection, memberId);
  await deleteDeviceRegistryByMemberId(connection, memberId);
  await deleteCommentsByMemberId(connection, memberId);
  await deleteAutobiographiesByMemberId(connection, memberId);
  await deleteBooksByMemberId(connection, memberId);
  await deleteMemberByMemberId(connection, memberId);
}

export interface Member {
  id: number;
  name: string;
  email: string;
  deletedAt: Date;
}

export async function findMembersByDeletedAt(connection: mariadb.PoolConnection): Promise<Member[]> {
  const rows = await connection.query(`
    SELECT
      m.id AS id,
      mm.name AS name,
      m.email AS email,
      m.deleted_at AS deleted_at
    FROM
      members AS m
    JOIN
      member_metadatas AS mm ON m.id = mm.member_id
    WHERE m.deleted_at IS NOT NULL
    `);
  console.log('rows:', rows);
  return rows.map((row: any) => {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      deletedAt: new Date(row.deleted_at),
    } as Member;
  });
}
