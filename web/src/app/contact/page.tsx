"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import { useSendPublicContact } from "@/data/support/hooks";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_EMAIL, WHATSAPP_DISPLAY, WHATSAPP_URL } from "@/lib/constants";
import { createContactSchema } from "@/lib/form-schemas";
import { getContactErrorKey } from "@/lib/contact-errors";
import { useTranslation } from "@/lib/i18n/context";

type ContactForm = z.infer<ReturnType<typeof createContactSchema>>;

export default function ContactPage() {
  const { t } = useTranslation();
  const contactSchema = useMemo(() => createContactSchema(t), [t]);
  const sendContact = useSendPublicContact();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactForm) => {
    setSubmitting(true);
    try {
      await sendContact(data);
      toast.success(t("contactPage.success"));
      reset();
    } catch (error) {
      const key = getContactErrorKey(error);
      toast.error(key ? t(key) : t("contactPage.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingPage
      title={t("contactPage.title")}
      subtitle={t("contactPage.subtitle")}
    >
      <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
        <div className="space-y-4 lg:col-span-1">
          <Card className="rounded-2xl border-border/80">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-bold text-lg">{t("contactPage.quickContact")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("contactPage.quickContactDesc")}
              </p>
              <Button asChild className="w-full bg-whatsapp hover:bg-whatsapp/90 text-white font-semibold">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {t("contactPage.whatsapp")}
                </a>
              </Button>
              <div className="space-y-3 pt-2 text-sm">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{SUPPORT_EMAIL}</span>
                </a>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{WHATSAPP_DISPLAY}</span>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl border-border shadow-lg lg:col-span-2">
          <CardContent className="p-6 sm:p-8">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="relative space-y-6"
              autoComplete="on"
            >
              {/* Layer 2 honeypot — hidden from humans, bots often fill it */}
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
                tabIndex={-1}
              >
                <label htmlFor="companyWebsite">Company website</label>
                <input
                  id="companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  {...register("companyWebsite")}
                />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="font-semibold">
                    {t("contactPage.name")}
                  </Label>
                  <Input id="name" {...register("name")} placeholder={t("contactPage.namePlaceholder")} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-semibold">
                    {t("contactPage.email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email")}
                    placeholder={t("auth.emailPlaceholder")}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className="font-semibold">
                  {t("contactPage.subject")}
                </Label>
                <Input id="subject" {...register("subject")} placeholder={t("contactPage.subjectPlaceholder")} />
                {errors.subject && (
                  <p className="text-sm text-destructive">{errors.subject.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="font-semibold">
                  {t("contactPage.message")}
                </Label>
                <Textarea
                  id="message"
                  {...register("message")}
                  placeholder={t("contactPage.messagePlaceholder")}
                  rows={5}
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message.message}</p>
                )}
              </div>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto font-semibold" size="lg">
                <Send className="h-4 w-4 mr-2" />
                {submitting ? t("contactPage.sending") : t("contactPage.send")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </MarketingPage>
  );
}
