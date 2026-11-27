import { privateMetadata } from "@/seo/metadata";
import { PublicProfile } from "@/features/achievements/PublicProfile";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <PublicProfile />;
}
