import * as React from "react";
import {
  Html,
  Body,
  Img,
  Preview,
  Container,
  Text,
  Heading,
  Head,
  Link,
} from "@react-email/components";

export function WaitlistEmail({ email }: { email: string }) {
  return (
    <Html lang="en">
      <Body
        style={{
          maxWidth: "672px",
          margin: "0 auto",
          fontFamily: "Geist, sans-serif",
        }}
      >
        <Head />
        <Preview>You are on the waitlist! 🎉 </Preview>
        <Container
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "white",
            color: "black",
            padding: "24px",
          }}
        >
          <Img
            style={{ maxWidth: "576px", width: "100%" }}
            src={`${process.env.NEXT_PUBLIC_BASE_URL}/email-banner.png`}
            alt="Momentum - AI powered TODO App"
          />
          <div style={{ height: "40px" }} />
          <Heading>Привет</Heading>
          <div style={{ height: "40px" }} />

          <Text style={{ fontFamily: "monospace" }}>
            Спасибо за подписку на Momentum!
          </Text>
          <div style={{ height: "40px" }} />

          <Text style={{ fontFamily: "monospace" }}>
            Чтобы быть в курсе всех новостей, подпишитесь на наш телеграмм
          </Text>
          <div style={{ height: "20px" }} />

          <Link
            style={{
              textDecoration: "underline",
              color: "#3b82f6",
              fontSize: "14px",
              fontFamily: "monospace",
            }}
            href="https://t.me/fearted"
          >
            Momentum
          </Link>

          <div style={{ height: "12px" }} />

          <Link
            style={{
              textDecoration: "underline",
              color: "#3b82f6",
              fontSize: "14px",
              fontFamily: "monospace",
            }}
            href="https://t.me/fearted"
          >
            Aleksandr
          </Link>

          <div style={{ height: "12px" }} />

          <Link
            style={{
              textDecoration: "underline",
              color: "#3b82f6",
              fontSize: "14px",
              fontFamily: "monospace",
            }}
            href="https://t.me/fearted"
          >
            Grishin
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
