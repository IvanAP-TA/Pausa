import { privateMetadata } from "@/seo/metadata";
import { PersonPage } from "@/features/people/PersonPage";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <PersonPage />;
}
