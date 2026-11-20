import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { GENRES, MAX_BIO, MAX_FAVORITES, MAX_GENRES, getProfile } from "@/lib/core/profile";
import { AVATARS, emojiOf } from "@/lib/avatars";
import { saveProfileAction } from "@/lib/profile-actions";
import { Avatar } from "@/components/avatar";
import { BackLink } from "@/components/back-link";
import { SubmitButton } from "@/components/submit-button";
import { FavoritesEditor } from "./favorites-editor";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("edit"), robots: { index: false } };
}

// A choice drawn as a tile: the native radio/checkbox stays the mechanism (keyboard, screen readers), the tile shows it.
const tile = "grid place-items-center border border-rule transition-colors duration-150 hover:border-muted peer-checked:border-accent peer-checked:bg-paper-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus";

/** Editing my profile: name, picture (no uploads: a gallery), a few lines, the genres I love, and my favourite titles. */
export default async function EditProfile({ params }: PageProps<"/[locale]/me/edit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [profile, t, tg] = await Promise.all([getDb().then((db) => getProfile(db, user.id)), getTranslations("profile"), getTranslations("profile.genres")]);
  const p = profile ?? { id: user.id, name: user.name, image: user.image ?? null, bio: null, favoriteGenres: [], favorites: [] };
  const current = emojiOf(p.image);
  const photo = p.image && !current ? p.image : null; // a real photo (Google): can be kept

  return (
    <main className="grid gap-10 px-4 pb-12 pt-4">
      <div className="grid gap-3">
        <BackLink href="/me" label={t("title")} />
        <h1 className="display">{t("edit")}</h1>
      </div>

      <form action={saveProfileAction} className="grid gap-8">
        <input type="hidden" name="locale" value={locale} />

        <div className="field-label">
          <label htmlFor="name">{t("name")}</label>
          <input id="name" name="name" required maxLength={40} defaultValue={p.name} autoComplete="nickname" className="field" />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm text-ink-2">{t("avatar")}</legend>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {photo && (
              <label className="cursor-pointer">
                <input type="radio" name="avatar" value="" defaultChecked className="peer sr-only" />
                <span className={`${tile} aspect-square`}>
                  <Avatar user={{ id: p.id, name: p.name, image: photo }} size={40} />
                  <span className="sr-only">{t("avatarPhoto")}</span>
                </span>
              </label>
            )}
            <label className="cursor-pointer">
              <input type="radio" name="avatar" value="none" defaultChecked={!photo && !current} className="peer sr-only" />
              <span className={`${tile} aspect-square`}>
                <Avatar user={{ id: p.id, name: p.name, image: null }} size={40} />
                <span className="sr-only">{t("avatarInitial")}</span>
              </span>
            </label>
            {AVATARS.map((g) => (
              <label key={g} className="cursor-pointer">
                <input type="radio" name="avatar" value={g} defaultChecked={current === g} className="peer sr-only" />
                <span className={`${tile} aspect-square text-2xl`}>
                  <span aria-hidden="true">{g}</span>
                  <span className="sr-only">{t("avatarPick", { glyph: g })}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field-label">
          <label htmlFor="bio">{t("bio")}</label>
          <textarea id="bio" name="bio" rows={3} maxLength={MAX_BIO} defaultValue={p.bio ?? ""} placeholder={t("bioPlaceholder")} className="field" />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm text-ink-2">{t("genresPick", { max: MAX_GENRES })}</legend>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <label key={g} className="cursor-pointer">
                <input type="checkbox" name="genre" value={g} defaultChecked={p.favoriteGenres.includes(g)} className="peer sr-only" />
                <span className={`${tile} min-h-11 px-3 text-sm text-ink-2 peer-checked:text-ink`}>{tg(g)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton className="btn btn-primary w-full sm:w-fit" pending={t("saving")}>{t("save")}</SubmitButton>
      </form>

      <section id="favorites" aria-labelledby="fav-title" className="grid scroll-mt-20 gap-4 border-t border-rule pt-8">
        <div className="grid gap-1">
          <h2 id="fav-title" className="chapter">{t("favorites")}</h2>
          <p className="text-sm text-muted">{t("favoritesHint")}</p>
        </div>
        <FavoritesEditor initial={p.favorites} max={MAX_FAVORITES} />
      </section>
    </main>
  );
}
