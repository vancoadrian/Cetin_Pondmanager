export interface AnglerAccountProfile {
  email: string
  id: string
  name: string
  phone?: string
}

export interface AccountProfileUpdateResponse {
  account: AnglerAccountProfile
  message: string
  ok: true
}
