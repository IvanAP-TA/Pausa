import { privateMetadata } from "@/seo/metadata";
import { ProfileEdit } from "@/features/people/ProfileEdit";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <ProfileEdit />;
}
