import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from '@react-email/components'
import { BRAND, styles } from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>رابط الدخول إلى إرث</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>رابط الدخول الخاص بك</Heading>
        <Text style={styles.text}>
          اضغط على الزر أدناه لتسجيل الدخول إلى حسابك في إرث. الرابط صالح لفترة
          قصيرة لأغراض الأمان.
        </Text>

        <div style={styles.buttonWrap}>
          <Button style={styles.button} href={confirmationUrl}>
            تسجيل الدخول
          </Button>
        </div>

        <Text style={styles.fallbackLabel}>
          أو انسخ الرابط التالي والصقه في متصفحك:
        </Text>
        <Text style={styles.fallbackUrl}>{confirmationUrl}</Text>

        <Text style={styles.footer}>
          إن لم تطلب هذا الرابط، يمكنك تجاهل هذه الرسالة بأمان.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
