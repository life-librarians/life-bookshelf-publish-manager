import mariadb from 'mariadb';
import { MemberBookPublication, NotionMemberBookPublication, UpdatePublication } from './types';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';
import { QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints';

// ================= Start of Mariadb Query Functions =================
export async function getAllMemberBookPublicationDetails(
  connection: mariadb.PoolConnection,
): Promise<MemberBookPublication[]> {
  const query = `
    SELECT
        p.id AS publication_id,
        b.id AS book_id,
        mm.name AS member_name,
        m.email AS member_email,
        b.title AS book_title,
        b.page AS book_pages,
        b.cover_image_url AS book_cover_image_url,
        p.price AS publication_price,
        p.requested_at AS publication_requested_at,
        p.will_published_at AS will_published_at,
        p.publish_status AS publish_status,
        p.published_at AS published_at
    FROM
        lifebookshelf.member_metadatas mm
    JOIN
        lifebookshelf.members m ON mm.member_id = m.id
    JOIN
        lifebookshelf.books b ON b.member_id = m.id
    JOIN
        lifebookshelf.publications p ON p.book_id = b.id
`;

  const rows = await connection.query(query);
  const memberBookPublications: MemberBookPublication[] = rows.map((row: any) => {
    return {
      publicationId: Number(row.publication_id),
      bookId: Number(row.book_id),
      memberName: row.member_name,
      memberEmail: row.member_email,
      bookTitle: row.book_title,
      bookPageCount: row.book_pages,
      bookCoverImageUrl: row.book_cover_image_url,
      publicationPrice: row.publication_price,
      publicationRequestedAt: new Date(row.publication_requested_at),
      willPublishedAt: new Date(row.will_published_at),
      publishStatus: row.publish_status,
      publishedAt: row.published_at ? new Date(row.published_at) : null,
    } as MemberBookPublication;
  });
  return memberBookPublications;
}

export async function updatePublication(
  connection: mariadb.PoolConnection,
  updatePublication: UpdatePublication,
): Promise<void> {
  try {
    const query = `
      UPDATE
          lifebookshelf.publications
      SET
          publish_status = ?,
          published_at = ?
      WHERE
          id = ?
  `;

    await connection.query(query, [
      updatePublication.newPublishStatus,
      updatePublication.newPublishedAt?.toISOString(),
      updatePublication.publicationId,
    ]);
  } catch (error) {
    console.error('Error updating publication:', error);
    throw error;
  }
}

// ================= End of Mariadb Query Functions =================

// ================= Start of Notion API Functions =================

export async function queryNotionDatabase(notion: Client): Promise<NotionMemberBookPublication[]> {
  try {
    const databaseId = notionConfig.databaseId;
    const response: QueryDatabaseResponse = await notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          property: '출판 요청일',
          direction: 'descending',
        },
      ],
    });

    const publications: NotionMemberBookPublication[] = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        publicationId: properties['출판 ID']?.number ?? 0,
        memberName: properties['고객명']?.title?.[0]?.text?.content ?? '',
        memberEmail: properties['고객 이메일']?.email ?? '',
        bookTitle: properties['책 제목']?.rich_text?.[0]?.text?.content ?? '',
        bookPageCount: properties['페이지 수']?.number ?? 0,
        bookCoverImageUrl: properties['책 커버 이미지 주소']?.url ?? '',
        publicationPrice: properties['가격(원)']?.number ?? 0,
        publicationRequestedAt: properties['출판 요청일']?.date?.start
          ? new Date(properties['출판 요청일'].date.start)
          : null,
        willPublishedAt: properties['예상 출판일']?.date?.start ? new Date(properties['예상 출판일'].date.start) : null,
        publishStatus: properties['출판 상태']?.select?.name ?? '',
        publishedAt: properties['출판일']?.date?.start ? new Date(properties['출판일'].date.start) : null,
      } as NotionMemberBookPublication;
    });

    return publications;
  } catch (error) {
    console.error('Error querying Notion database:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}
