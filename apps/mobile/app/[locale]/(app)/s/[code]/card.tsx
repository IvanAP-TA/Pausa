import { privateMetadata } from "@/seo/metadata";
import { SerataCardPage } from "@/features/serata/SerataCardPage";

// The public page of a finished Serata's card: no sign-in. One shell for every code, filled in by the client (the Worker serves it
// for /{locale}/s/{code}/card, see shell_path in crates/core/src/shell.rs).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <SerataCardPage />;
}
