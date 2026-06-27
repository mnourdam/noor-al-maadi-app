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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ confirmationUrl }: SignupEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>أكّد بريدك الإلكتروني للانضمام إلى إرث</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>أهلًا بك في إرث</Heading>
        <Text style={styles.text}>
          شكرًا لانضمامك إلينا. لتفعيل حسابك وبدء رحلتك بين الشخصيات والدول
          والمعارك، يرجى تأكيد بريدك الإلكتروني بالضغط على الزر أدناه.
        </Text>

        <div style={styles.buttonWrap}>
          <Button style={styles.button} href={confirmationUrl}>
            تأكيد البريد الإلكتروني
          </Button>
        </div>

        <Text style={styles.fallbackLabel}>
          أو انسخ الرابط التالي والصقه في متصفحك:
        </Text>
        <Text style={styles.fallbackUrl}>{confirmationUrl}</Text>

        <Text style={styles.footer}>
          إن لم تقم بإنشاء حساب في إرث، يمكنك تجاهل هذه الرسالة بأمان.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
