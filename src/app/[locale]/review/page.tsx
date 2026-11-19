import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { reviewEnabled } from "@/lib/review";
import { reviewSignIn } from "./actions";

export const metadata = { title: "App review sign-in", robots: { index: false, follow: false } };

/** Sign-in for app-store reviewers, who cannot receive an email link. Exists only when REVIEW_EMAIL and REVIEW_PASSWORD are set. */
export default async function Review({ params, searchParams }: PageProps<"/[locale]/review">) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!reviewEnabled()) notFound();
  const { error } = await searchParams;
  return (
    <main className="projector mx-auto grid min-h-dvh w-full max-w-[40rem] grid-rows-[auto_1fr] px-4 py-6">
      <p className="font-display text-2xl text-ink">Pausa</p>
      <div className="grid content-center gap-4 py-10">
        <h1 className="display text-poster">Review sign-in</h1>
        <p className="max-w-[45ch] text-ink-2">For app store reviewers. Enter the password given in the review instructions to open a demo group with sample films.</p>
        <form action={reviewSignIn} className="well grained grid gap-4 p-5">
          <label className="grid gap-1 text-sm text-muted">Password
            <input type="password" name="password" required autoComplete="current-password" className="min-h-11 rounded-sm border border-rule bg-paper px-3 text-base text-ink" />
          </label>
          {error && <p role="alert" className="text-sm text-error">{error === "slow" ? "Too many attempts. Try again in an hour." : "Wrong password."}</p>}
          <button className="btn btn-primary btn-lg">Open the demo</button>
        </form>
      </div>
    </main>
  );
}
