import mariadb from 'mariadb';
import { BookChapter, BookContent, MemberBookPublication } from './types';
import { notionConfig } from './config';
import { Client } from '@notionhq/client';

// ================= Start of Mariadb Query Functions =================
export async function getMemberBookPublicationDetails(
  connection: mariadb.PoolConnection,
  publicationId: number,
): Promise<MemberBookPublication> {
  const query = `
    SELECT
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
    WHERE
        p.id = ?
`;

  const rows = await connection.query(query, [publicationId]);

  if (rows.length === 0) {
    throw new Error(`Publication with ID ${publicationId} not found`);
  }

  const row = rows[0]; // Get the first (and only) row

  return {
    publicationId: Number(publicationId),
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
  };
}
export async function getBookChaptersAndContents(
  connection: mariadb.PoolConnection,
  bookId: number,
): Promise<BookChapter[]> {
  const query = `
    SELECT
        bc.name AS chapter_name,
        bc.number AS chapter_number,
        bcnt.page_content,
        bcnt.page_number
    FROM
        lifebookshelf.book_chapters bc
    JOIN
        lifebookshelf.book_contents bcnt ON bcnt.book_chapter_id = bc.id
    WHERE
        bc.book_id = ?
`;

  const rows = await connection.query(query, [bookId]);

  const chaptersMap = new Map<number, BookChapter>();

  rows.forEach((row: any) => {
    const chapterNumber = row.chapter_number;
    const content: BookContent = {
      pageContent: row.page_content,
      pageNumber: row.page_number,
    };

    if (!chaptersMap.has(chapterNumber)) {
      chaptersMap.set(chapterNumber, {
        chapterName: row.chapter_name,
        chapterNumber: chapterNumber,
        contents: [content],
      });
    } else {
      chaptersMap.get(chapterNumber)!.contents.push(content);
    }
  });

  return Array.from(chaptersMap.values());
}

// ================= End of Mariadb Query Functions =================

// ================= Start of Notion API Functions =================

// Initialize the Notion client
