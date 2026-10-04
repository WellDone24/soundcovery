import { redirect } from "next/navigation";

type QRFestivalPageProps = {
  params: Promise<{ festival: string }>;
};

export default async function QRFestivalPage({ params }: QRFestivalPageProps) {
  const { festival } = await params;

  redirect(
    `/?festival=${encodeURIComponent(festival)}&utm_source=festival_qr`,
  );
}
