import { privateMetadata } from "@/seo/metadata";
import { HomeEntry } from "@/features/Home";

// As in v1: signed in, /home opens the diary of the last Cerchia; with none, the page to join or create one.
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <HomeEntry />;
}
