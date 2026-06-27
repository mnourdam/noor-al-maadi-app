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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>إعادة تعيين كلمة المرور في إرث</Preview>
    <Body style={styles.main}>
      <Container style={styles.card}>
        <div style={styles.header}>
          <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
          <Heading style={styles.brand}>{BRAND.brandName}</Heading>
          <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
        </div>

        <Heading style={styles.h1}>إعادة تعيين كلمة المرور</Heading>
        <Text style={styles.text}>
          تلقّينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك في إرث. اضغط على
          الزر أدناه لاختيار كلمة مرور جديدة. الرابط صالح لفترة محدودة.
        </Text>

        <div style={styles.buttonWrap}>
          <Button style={styles.button} href={confirmationUrl}>
            إعادة تعيين كلمة المرور
          </Button>
        </div>

        <Text style={styles.fallbackLabel}>
          أو انسخ الرابط التالي والصقه في متصفحك:
        </Text>
        <Text style={styles.fallbackUrl}>{confirmationUrl}</Text>

        <Text style={styles.footer}>
          إن لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة، ولن
          تتغيّر كلمة المرور.
          <br />© {new Date().getFullYear()} {BRAND.brandName} — {BRAND.brandNameLatin}
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
