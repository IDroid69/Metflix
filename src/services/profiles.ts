import api from "./api";

export type Profile = {
  id: number;
  user_id: number;
  name: string;
  avatar_url?: string | null;
  is_kids: boolean;
};

export async function listProfiles(): Promise<Profile[]> {
  const res = await api.get("/profiles/");
  return res.data as Profile[];
}

export async function createProfile(payload: { name: string; avatar_url?: string | null; is_kids?: boolean }) {
  const res = await api.post("/profiles/", payload);
  return res.data as Profile;
}

export async function updateProfile(id: number, payload: Partial<{ name: string; avatar_url?: string | null; is_kids: boolean }>) {
  const res = await api.put(`/profiles/${id}`, payload);
  return res.data as Profile;
}

export async function deleteProfile(id: number) {
  const res = await api.delete(`/profiles/${id}`);
  return !!res.data?.ok;
}
