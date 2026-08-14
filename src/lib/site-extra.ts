import {
  getPublicFaqs,
  getPublicDoctorProfile,
  submitSupportMessage,
  submitReview,
  placeOrder,
  searchSiteContent,
} from "@/lib/actions.functions";

export interface Faq {
  id: string;
  category: string;
  question: string;
  answer: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface DoctorProfile {
  id: number;
  full_name: string;
  title: string;
  tagline: string;
  bio: string;
  credentials: string;
  education: string;
  experience_years: number;
  languages: string;
  specialties: string;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  social_links: Record<string, string>;
  is_active: boolean;
  updated_at: string;
}

export interface SearchGroup {
  title: string;
  items: Array<{
    id: string;
    label: string;
    description: string;
    href: string;
  }>;
}

export async function getFaqs(): Promise<Faq[]> {
  const result = await getPublicFaqs({ data: undefined });
  return (result.faqs ?? []) as Faq[];
}

export async function getDoctorProfile(): Promise<DoctorProfile | null> {
  const result = await getPublicDoctorProfile({ data: undefined });
  return (result.profile ?? null) as DoctorProfile | null;
}

export async function sendSupportMessage(data: {
  name: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
}): Promise<{ error: string | null }> {
  return submitSupportMessage({ data });
}

export async function sendReview(data: {
  name: string;
  rating: number;
  text: string;
}): Promise<{ error: string | null }> {
  return submitReview({ data });
}

export async function submitOrder(data: {
  items: Array<{ productId: string; quantity: number }>;
  name: string;
  phone: string;
  email?: string;
  address: string;
  notes?: string;
}): Promise<{ error: string | null; orderNo?: string | null }> {
  return placeOrder({ data });
}

export async function searchSiteContentPublic(q: string): Promise<SearchGroup[]> {
  const result = await searchSiteContent({ data: { q } });
  return (result.groups ?? []) as SearchGroup[];
}
