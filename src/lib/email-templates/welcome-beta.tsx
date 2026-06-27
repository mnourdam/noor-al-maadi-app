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
import type { TemplateEntry } from './registry'

interface WelcomeBetaProps {
  recipient?: string
  displayName?: string
}

const WelcomeBetaEmail = ({ displayName }: WelcomeBetaProps) => {
  const name = displayName?.trim() || 'مرحبًا بك'
  return (
    <Html lang="ar" dir="rtl">
      <Head />
      <Preview>مرحبًا بك في إرث — تم إنشاء حسابك بنجاح</Preview>
      <Body style={styles.main}>
        <Container style={styles.card}>
          <div style={styles.header}>
            <Img src={BRAND.logoUrl} alt="إرث" style={styles.logo} />
            <Heading style={styles.brand}>{BRAND.brandName}</Heading>
            <Text style={styles.tagline}>رحلة عبر التاريخ الإسلامي</Text>
          </div>

          <Heading style={styles.h1}>أهلًا {name} في إرث</Heading>
          <Text style={styles.text}>
            تم إنشاء حسابك بنجاح، ويمكنك الآن الدخول مباشرة وبدء رحلتك بين
            الشخصيات والدول والمعارك.
          </Text>
          <Text style={styles.text}>
            شكرًا لمساعدتك لنا في اختبار التطبيق خلال هذه المرحلة، ملاحظاتك
            وتجربتك تصنع فارقًا حقيقيًا في تطوير إرث.
          </Text>
          <Text style={{ ...styles.text, color: BRAND.textMuted, fontSize: '13px' }}>
            نرحّب بكل ملاحظاتك واقتراحاتك — فريق إرث ممتنّ لمشاركتك.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WelcomeBetaEmail,
  subject: 'مرحبًا بك في إرث',
  displayName: 'Welcome (Beta)',
  previewData: { displayName: 'صديقنا' },
} satisfies TemplateEntry
