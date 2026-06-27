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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>تأكيد تغيير البريد الإلكتروني في إرث</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>تأكيد تغيير البريد الإلكتروني</Heading>
        <Text style={styles.text}>
          طلبتَ تغيير بريدك الإلكتروني في إرث من <strong>{oldEmail}</strong> إلى{' '}
          <strong>{newEmail}</strong>. اضغط على الزر أدناه لتأكيد التغيير.
        </Text>

        <div style={styles.buttonWrap}>
          <Button style={styles.button} href={confirmationUrl}>
            تأكيد تغيير البريد
          </Button>
        </div>

        <Text style={styles.fallbackLabel}>
          أو انسخ الرابط التالي والصقه في متصفحك:
        </Text>
        <Text style={styles.fallbackUrl}>{confirmationUrl}</Text>

        <Text style={styles.footer}>
          إن لم تطلب هذا التغيير، يرجى تأمين حسابك فورًا.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
