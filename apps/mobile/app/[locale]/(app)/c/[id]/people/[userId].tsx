import { privateMetadata } from "@/seo/metadata";
import { Person } from "@/features/people/Person";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Person />;
}
