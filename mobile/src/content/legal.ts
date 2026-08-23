/**
 * Privacy Policy and Terms of Use, as data.
 *
 * Kept here rather than as hard-coded JSX so both documents share one
 * renderer (see screens/LegalScreen.tsx) and so a wording change is an edit
 * to prose, not to a layout.
 *
 * The privacy text is the same document published at
 * https://awb-labs.github.io/baby-tracker-app/ — App Store Connect needs a
 * public URL, and a policy that says one thing in the app and another on the
 * web is worse than having only one. Change both together.
 */

export type LegalDoc = "privacy" | "terms";

export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered in order, with a gap between each. */
  body?: string[];
  /** Bulleted points, shown after the paragraphs. */
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  /** Closing line under the last section. */
  footer: string;
}

const CONTACT = "aliezz140@gmail.com";

export const LEGAL: Record<LegalDoc, LegalDocument> = {
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated August 1, 2026",
    intro:
      'Baby Tracker ("the App") is provided by AWB-labs ("we", "us", "our"). This policy explains what information we collect when you use the App, how we use it, and the choices you have. By using the App, you agree to this policy.',
    sections: [
      {
        heading: "1. Information We Collect",
        body: ["Account information, provided when you sign up:"],
        bullets: [
          "Name",
          "Email address",
          "Password (stored as a one-way hash — we never store or can see your actual password)",
          "Your relationship to the baby you care for (e.g. mother, father, grandparent), if you choose to share it",
        ],
      },
      {
        heading: "Baby profile information",
        body: ["Provided by you or a caregiver you invite:"],
        bullets: [
          "Baby's name, date of birth, gender, and a chosen avatar icon and colour",
        ],
      },
      {
        heading: "Activity and health information",
        body: ["Logged by you and any caregivers you invite:"],
        bullets: [
          "Feeding, pumping, and sleep sessions, including timestamps and volumes",
          "Diaper changes",
          "Growth measurements (weight, height)",
          "Illness, medication, dosage, and temperature entries",
          "Vaccination records",
          "Notes you choose to add to any entry",
        ],
      },
      {
        heading: "Device and usage information",
        bullets: [
          "A push-notification token, if you enable reminders, used only to deliver the reminders you set",
          "Basic app preferences (measurement units, theme, notification settings)",
          "A rating or message you choose to send us from the feedback prompt, along with the app version it was sent from",
        ],
        body: [
          "This is sensitive information about your child's health, and we treat it accordingly — see \"How We Protect Your Information\" below.",
          "We do not collect location data, and we do not use advertising or analytics tracking of any kind.",
        ],
      },
      {
        heading: "2. How We Use Your Information",
        body: ["We use the information you provide to:"],
        bullets: [
          "Operate the App's core features — logging, timelines, summaries, and trends",
          "Let you share a baby's records with caregivers you explicitly invite",
          "Send reminders you set up",
          "Send password-reset emails when requested",
          "Maintain and improve the App's reliability and security",
        ],
      },
      {
        heading: "",
        body: [
          "We do not sell your information, and we do not share it with third parties for their own marketing purposes.",
        ],
      },
      {
        heading: "3. Sharing With Caregivers",
        body: [
          "Baby Tracker is built to be used by a family or care team together. If you invite someone as a caregiver, they will be able to see and add to all of that baby's activity and health records, and will see your name and relationship to the baby.",
          "Removing a caregiver ends their access, but does not delete entries they already logged — those remain part of the baby's shared history.",
        ],
      },
      {
        heading: "4. Service Providers",
        body: [
          "We use the following third parties to help operate the App. They process data on our behalf and are not permitted to use it for their own purposes:",
        ],
        bullets: [
          "Database and hosting infrastructure (Supabase, Vercel) — stores and serves all app data",
          "Expo's push notification service — delivers the reminders you set, using your device's push token",
          "Our email delivery provider — sends password-reset emails",
        ],
      },
      {
        heading: "5. Data Retention and Deletion",
        body: [
          "You can permanently delete your account at any time from Account → Delete my account.",
          "If you created a baby's profile, deleting your account permanently deletes that baby's entire record — including every caregiver's entries — for everyone with access to it.",
          "If you are a caregiver on a baby you didn't create, deleting your account removes your access and personal information, while the entries you logged remain part of that baby's shared history so the family doesn't lose its records.",
        ],
      },
      {
        heading: "6. Children's Privacy",
        body: [
          "Baby Tracker is intended for use by parents, guardians, and other adult caregivers to track information about their children — it is not directed at, marketed to, or knowingly used directly by children. Account holders must be adults. Information about a child that appears in the App is entered by an adult caregiver, not by the child.",
        ],
      },
      {
        heading: "7. How We Protect Your Information",
        body: [
          "We use industry-standard measures to protect your information, including encrypted connections (HTTPS) between the App and our servers, and one-way hashing for passwords. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
        ],
      },
      {
        heading: "8. Your Choices and Rights",
        body: ["You can, at any time:"],
        bullets: [
          "Edit or delete any entry you've logged",
          "Update your account details from Account",
          "Invite or remove caregivers",
          "Delete your account entirely, as described above",
        ],
      },
      {
        heading: "9. Changes to This Policy",
        body: [
          "We may update this policy from time to time. If we make material changes, we'll update the date at the top of this page.",
        ],
      },
      {
        heading: "10. Contact Us",
        body: [
          `If you have questions about this policy or your information, contact us at ${CONTACT}.`,
        ],
      },
    ],
    footer: "Baby Tracker is provided by AWB-labs.",
  },

  terms: {
    title: "Terms of Use",
    updated: "Last updated August 23, 2026",
    intro:
      'These terms cover your use of Baby Tracker ("the App"), provided by AWB-labs ("we", "us", "our"). By creating an account or using the App, you agree to them. If you don\'t agree, please don\'t use the App.',
    sections: [
      {
        heading: "1. Who Can Use Baby Tracker",
        body: [
          "You must be an adult — 18 or older, or the age of majority where you live — to create an account. Baby Tracker is for parents, guardians, and other adult caregivers recording information about a child in their care. It is not for use by children themselves.",
          "You are responsible for keeping your password to yourself and for everything done through your account.",
        ],
      },
      {
        heading: "2. Your Baby's Records Are Yours",
        body: [
          "Everything you log — feeds, sleep, diapers, growth, health entries, notes — belongs to you and the caregivers you share it with. We don't claim ownership of it, we don't sell it, and we don't use it to advertise to you.",
          "We store and process it only to run the App, as described in the Privacy Policy.",
        ],
      },
      {
        heading: "3. Sharing With Caregivers",
        body: [
          "Inviting someone as a caregiver gives them full access to that baby's records: they can see every entry and add their own. Only invite people you intend to share all of it with.",
          "Removing a caregiver ends their access going forward. Entries they already logged stay part of the baby's shared history, so the record doesn't develop gaps.",
        ],
      },
      {
        heading: "4. Baby Tracker Is Not Medical Advice",
        body: [
          "This is the most important thing on this page. Baby Tracker is a record-keeping tool. It is not a medical device, and nothing in it — including summaries, averages, trends, vaccine schedules and reminders — is medical advice, diagnosis, or treatment.",
          "Always talk to a qualified healthcare professional about your child's health. Never delay seeking care, or disregard advice you've been given, because of something you saw in the App.",
          "Vaccine schedules and reminders are a convenience based on common guidance and may not match what applies where you live or what your child's doctor recommends. Treat your healthcare provider's schedule as the correct one.",
          "If you think your child may have a medical emergency, contact your doctor or emergency services immediately.",
        ],
      },
      {
        heading: "5. Reminders Are Best-Effort",
        body: [
          "Reminders are delivered as push notifications through your device and third-party services. They can be delayed or missed for reasons outside our control — no network, notifications turned off, a device that's off or low on battery, or an outage at a provider.",
          "Don't rely on a reminder as the only thing standing between you and a dose of medicine or a feed that matters.",
        ],
      },
      {
        heading: "6. Fair Use",
        body: ["When using Baby Tracker, please don't:"],
        bullets: [
          "Use it for anything unlawful, or to store anything you have no right to store",
          "Try to access another family's records, or any part of our systems you haven't been given access to",
          "Interfere with the App's operation, or attempt to break, overload, or probe it",
          "Resell, redistribute, or build a competing service out of the App or its data",
          "Impersonate someone else, including when accepting a caregiver invitation",
        ],
      },
      {
        heading: "7. Availability",
        body: [
          "We work to keep the App running and your data safe, but we can't promise it will always be available, uninterrupted, or error-free. We may change, suspend, or discontinue features, and we may need to take the service down for maintenance.",
          "Keep your own copy of anything you can't afford to lose.",
        ],
      },
      {
        heading: "8. Ending Your Account",
        body: [
          "You can delete your account at any time from Account → Delete my account. What happens to the records depends on whether you created the baby's profile — the Privacy Policy sets this out in full, and deletion is permanent either way.",
          "We may suspend or close an account that breaks these terms, or where we're required to by law.",
        ],
      },
      {
        heading: "9. Liability",
        body: [
          "The App is provided \"as is\", without warranties of any kind, to the fullest extent the law allows. We are not liable for indirect or consequential loss, for lost data, or for decisions made on the basis of information in the App.",
          "Nothing here limits liability that can't be limited by law — including for death or personal injury caused by negligence, or for fraud.",
        ],
      },
      {
        heading: "10. Changes to These Terms",
        body: [
          "We may update these terms from time to time. If we make material changes, we'll update the date at the top of this page. Continuing to use the App after that means you accept the updated terms.",
        ],
      },
      {
        heading: "11. Contact",
        body: [`Questions about these terms? Email us at ${CONTACT}.`],
      },
    ],
    footer: "Baby Tracker is provided by AWB-labs.",
  },
};
