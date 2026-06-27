import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from '@react-email/components'
import { BRAND, styles } from './_brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رمز التحقق الخاص بك</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>تأكيد الهوية</Heading>
        <Text style={styles.text}>استخدم الرمز التالي لتأكيد هويتك:</Text>
        <Text style={styles.code}>{token}</Text>

        <Text style={styles.footer}>
          هذا الرمز صالح لفترة قصيرة. إن لم تطلب ذلك، يمكنك تجاهل الرسالة.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
