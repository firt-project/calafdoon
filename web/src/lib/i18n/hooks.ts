"use client";

import { useTranslation } from "@/lib/i18n/context";

const NAV_HREFS = [
  { href: "/", key: "nav.home" as const },
  { href: "/about", key: "nav.about" as const },
  { href: "/how-it-works", key: "nav.howItWorks" as const },
  { href: "/#why-trust", key: "nav.whyUs" as const },
  { href: "/pricing", key: "nav.pricing" as const },
  { href: "/faq", key: "nav.faq" as const },
  { href: "/contact", key: "nav.contact" as const },
] as const;

export function useNavLinks() {
  const { t } = useTranslation();
  return NAV_HREFS.map((link) => ({
    href: link.href,
    label: t(link.key),
  }));
}

export function useFooterLinks() {
  const { t } = useTranslation();
  return [
    ...useNavLinks().filter((l) => l.href !== "/"),
    { href: "/privacy", label: t("nav.privacy") },
    { href: "/terms", label: t("nav.terms") },
  ];
}

export function useAppNavLinks(profileComplete = true) {
  const { t } = useTranslation();

  if (profileComplete) {
    // Profile lives in the account menu / settings — not the main tabs.
    return [
      {
        href: "/dashboard",
        label: t("app.home"),
        mobileLabel: t("app.home"),
        icon: "LayoutDashboard" as const,
        tab: true,
      },
      {
        href: "/matches",
        label: t("app.discover"),
        icon: "Heart" as const,
        tab: true,
      },
      {
        href: "/chat",
        label: t("app.messages"),
        icon: "MessageCircle" as const,
        tab: true,
      },
      {
        href: "/likes",
        label: t("app.likes"),
        icon: "Sparkles" as const,
        tab: true,
      },
      {
        href: "/notifications",
        label: t("app.notifications"),
        icon: "Bell" as const,
        tab: false,
      },
    ];
  }

  return [
    {
      href: "/dashboard",
      label: t("app.home"),
      mobileLabel: t("app.home"),
      icon: "LayoutDashboard" as const,
      tab: true,
    },
    {
      href: "/matches",
      label: t("app.matches"),
      icon: "Heart" as const,
      tab: true,
      locked: true,
    },
    {
      href: "/chat",
      label: t("app.messages"),
      icon: "MessageCircle" as const,
      tab: true,
      locked: true,
    },
    {
      href: "/questionnaire",
      label: t("app.completeProfile"),
      mobileLabel: t("app.completeProfileShort"),
      icon: "ClipboardList" as const,
      tab: true,
    },
    {
      href: "/notifications",
      label: t("app.notifications"),
      icon: "Bell" as const,
      tab: false,
    },
  ];
}

export function useFaqItems() {
  const { t } = useTranslation();
  return [
    { question: t("faq.q1"), answer: t("faq.a1") },
    { question: t("faq.q2"), answer: t("faq.a2") },
    { question: t("faq.q3"), answer: t("faq.a3") },
    { question: t("faq.q4"), answer: t("faq.a4") },
    { question: t("faq.q5"), answer: t("faq.a5") },
    { question: t("faq.q6"), answer: t("faq.a6") },
  ];
}
