import { MarketingPage } from "@/components/marketing/marketing-page";
import { SUPPORT_EMAIL } from "@/lib/constants";

/** Play Console CSAE contact (developer-provided). */
const CHILD_SAFETY_CONTACT_EMAIL = "alqaazimi@gmail.com";

/**
 * Public Child Safety Standards page for Google Play Dating/Social CSAE.
 * English copy is always shown so Play reviewers see the required text
 * regardless of the site language toggle.
 */
export function ChildSafetyPageContent() {
  return (
    <MarketingPage
      title="HelCalaf — Child Safety Standards (CSAE)"
      subtitle="Public child safety standards for Hel Calafkaaga (HelCalaf). Adults 18+ only."
    >
      <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl space-y-6 text-muted-foreground">
        <section className="space-y-3">
          <p className="text-base leading-relaxed text-foreground">
            HelCalaf is a marriage matchmaking app for adults 18+.
          </p>
          <p className="leading-relaxed">We do not allow users under 18.</p>
          <p className="leading-relaxed">
            We prohibit child sexual abuse and exploitation (CSAE), including any
            sexual content involving minors, grooming, or sharing of CSAM.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">
            Prevention &amp; enforcement
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Age gate: users must confirm they are 18+</li>
            <li>Users can report and block profiles/messages in-app</li>
            <li>Reports are reviewed by our team</li>
            <li>We remove violating content/accounts</li>
            <li>
              We report CSAM to relevant authorities (e.g. NCMEC/local authorities)
              where required by law
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold text-foreground">How to report</h2>
          <p className="leading-relaxed">
            In the app: use Report / Block on a profile or chat.
          </p>
          <p className="leading-relaxed">
            Email:{" "}
            <a
              className="font-semibold text-primary hover:underline"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                "Child safety / CSAM report"
              )}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
          <h2 className="text-xl font-bold text-foreground">
            Contact for child-safety / CSAM compliance
          </h2>
          <p className="leading-relaxed">
            <a
              className="font-semibold text-primary hover:underline"
              href={`mailto:${CHILD_SAFETY_CONTACT_EMAIL}?subject=${encodeURIComponent(
                "Child safety / CSAM compliance"
              )}`}
            >
              {CHILD_SAFETY_CONTACT_EMAIL}
            </a>
          </p>
          <p className="text-sm leading-relaxed">
            Play Console support contact for this developer account:{" "}
            <a
              className="font-semibold text-primary hover:underline"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>
      </article>
    </MarketingPage>
  );
}
