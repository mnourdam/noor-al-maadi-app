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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>دعوة للانضمام إلى إرث</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>تمت دعوتك للانضمام</Heading>
        <Text style={styles.text}>
          لقد دُعيت للانضمام إلى إرث — عالم تفاعلي لاستكشاف التاريخ الإسلامي.
          اضغط على الزر أدناه لقبول الدعوة وإنشاء حسابك.
        </Text>

        <div style={styles.buttonWrap}>
          <Button style={styles.button} href={confirmationUrl}>
            قبول الدعوة
          </Button>
        </div>

        <Text style={styles.fallbackLabel}>
          أو انسخ الرابط التالي والصقه في متصفحك:
        </Text>
        <Text style={styles.fallbackUrl}>{confirmationUrl}</Text>

        <Text style={styles.footer}>
          إن لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
