import nodemailer from 'nodemailer';
import { emailConfig } from './config';
import { MemberBookPublication } from './types';
import { getFullImageUrl, publishStatusToKorean } from './utils';

const transporter = nodemailer.createTransport({
  service: emailConfig.service,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
});

export async function sendEmail(publicationInfo: MemberBookPublication) {
  const imageUrl = (await getFullImageUrl(publicationInfo.bookCoverImageUrl)) as string;

  const mailOptions = {
    from: emailConfig.user,
    to: emailConfig.receviver,
    subject: '새 출판 요청이 접수되었습니다.',
    html: `
      <h2>새 출판 요청이 접수되었습니다.</h2>
      <p><strong>출판 ID:</strong> ${publicationInfo.publicationId}</p>
      <p><strong>고객 이메일:</strong> ${publicationInfo.memberEmail}</p>
      <p><strong>책 제목:</strong> ${publicationInfo.bookTitle}</p>
      <p><strong>페이지 수:</strong> ${publicationInfo.bookPageCount}</p>
      <p><strong>책 커버 이미지 주소:</strong> <a href="${imageUrl}">${imageUrl}</a></p>
      <p><strong>가격(원):</strong> ${publicationInfo.publicationPrice}</p>
      <p><strong>출판 요청일:</strong> ${publicationInfo.publicationRequestedAt}</p>
      <p><strong>예상 출판일:</strong> ${publicationInfo.willPublishedAt}</p>
      <p><strong>출판 상태:</strong> ${publishStatusToKorean(publicationInfo.publishStatus)}</p>
    `,
  };

  const result = await transporter.sendMail(mailOptions);
  console.log('Email sent:', result);
}
