export type LakeSlug = 'velky-cetin' | 'strkovisko-kocka'
export type LakeScope = LakeSlug | 'all'

export interface Peg {
  id: string
  lake: LakeSlug
  label: string
  type: 'shore' | 'cabin'
  requiresCabinReservation?: boolean
  x: number
  y: number
  capacity: number
  status: 'free' | 'reserved' | 'weekend-free' | 'maintenance'
  notes: string
}

export interface Lake {
  slug: LakeSlug
  name: string
  areaHa: number
  mode: string
  summary: string
  highlights: string[]
  facilities: string[]
  fishStock: string[]
  rules: string[]
  image: string
  galleryImages: string[]
  mapImage?: string
}

export interface Reservation {
  id: string
  lake: LakeSlug
  pegId: string
  guest: string
  contactEmail?: string
  contactPhone: string
  from: string
  to: string
  type: 'day' | 'weekend' | 'week'
  status: 'confirmed' | 'pending' | 'blocked'
  permitId: string
  cabinProductId?: string
  rentalIds: string[]
  extraIds: string[]
  paymentMethodId?: string
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'waived'
  internalNote: string
  source: 'phone' | 'web' | 'admin'
}

export type CatchRecordStatus = 'pending' | 'approved' | 'rejected'
export type CatchPhotoStatus = 'uploaded' | 'ai-ready'
export type CatchPhotoAiStatus = 'queued' | 'ready' | 'needs-review'

export interface CatchWeatherSnapshot {
  airTempC: number
  cloudCoverPct: number
  condition: string
  pressureHpa: number
  pressureTrend: 'falling' | 'rising' | 'stable'
  source: 'mock' | 'manual' | 'weather-api' | 'station'
  waterTempC: number
  windDirection: string
  windKph: number
}

export interface CatchRecord {
  id: string
  angler: string
  lake: LakeSlug
  pegId: string
  species: string
  weightKg: number
  lengthCm: number
  bait: string
  caughtAt: string
  released: boolean
  photoLabel: string
  photoId?: string
  photoStoragePath?: string
  photoUrl?: string
  notes: string
  status: CatchRecordStatus
  reviewNote?: string
  reviewedAt?: string
  reviewedBy?: string
  weather?: CatchWeatherSnapshot
}

export type CatchSavedReportAudience = 'accountant' | 'manager' | 'owner'
export type CatchSavedReportCadence = 'manual' | 'monthly' | 'weekly'
export type CatchSavedReportDelivery = 'email-ready' | 'in-app'
export type CatchReportDeliveryProvider = 'disabled' | 'mock' | 'resend'
export type CatchReportDeliveryStatus = 'failed' | 'prepared' | 'sent' | 'skipped'

export interface CatchSavedReportFilter {
  dateFrom?: string
  dateTo?: string
  lake: LakeScope
  seasonWindowId: string
  species?: string
}

export interface CatchSavedReport {
  id: string
  audience: CatchSavedReportAudience
  cadence: CatchSavedReportCadence
  createdAt: string
  delivery: CatchSavedReportDelivery
  description: string
  enabled: boolean
  filter: CatchSavedReportFilter
  includeRawCsv: boolean
  includeTrendSignals: boolean
  lastGeneratedAt?: string
  recipients: string[]
  title: string
  updatedAt: string
}

export interface CatchReportDeliveryLog {
  id: string
  attachmentCount: number
  createdAt: string
  externalId?: string
  message: string
  provider: CatchReportDeliveryProvider
  recipients: string[]
  reportId: string
  status: CatchReportDeliveryStatus
  subject: string
}

export interface CatchPhoto {
  id: string
  catchId: string
  label: string
  fileName: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  publicUrl: string
  status: CatchPhotoStatus
  aiStatus: CatchPhotoAiStatus
  aiNotes: string
  uploadedAt: string
}

export interface TripLogbookMember {
  id: string
  name: string
  role: 'owner' | 'member' | 'guest'
  userId?: string
}

export interface TripLogbook {
  id: string
  title: string
  lake: LakeSlug
  pegIds: string[]
  from: string
  to: string
  mode: 'personal' | 'group' | 'competition'
  status: 'draft' | 'active' | 'closed'
  owner: string
  shareCode: string
  members: TripLogbookMember[]
  note: string
  ownerUserId?: string
}

export interface TripLogbookEntry {
  id: string
  logbookId: string
  catchId?: string
  angler: string
  lake: LakeSlug
  pegId: string
  species: string
  weightKg: number
  lengthCm: number
  bait: string
  caughtAt: string
  released: boolean
  photoStatus: 'missing' | 'uploaded' | 'ai-ready'
  verified: boolean
}

export interface TournamentSector {
  id: string
  label: string
  x: number
  y: number
  team?: string
  weightKg: number
}

export type TournamentOperationsMode = 'public-only' | 'registration-only' | 'full-dispatch'

export interface Tournament {
  id: string
  name: string
  lake: LakeSlug
  dateRange: string
  operationsMode: TournamentOperationsMode
  status: 'planned' | 'live' | 'closed'
  sectors: TournamentSector[]
}

export type TournamentTeamRegistrationStatus = 'submitted' | 'approved' | 'waitlisted' | 'rejected'

export interface TournamentTeamRegistration {
  id: string
  tournamentId: string
  teamName: string
  contactName: string
  contactPhone: string
  contactEmail?: string
  memberCount: number
  city?: string
  preferredSectorId?: string
  assignedSectorId?: string
  note: string
  status: TournamentTeamRegistrationStatus
  createdAt: string
  reviewedAt?: string
  reviewNote?: string
}

export interface TournamentMarshal {
  id: string
  name: string
  phone: string
  assignedSectorIds: string[]
  status: 'available' | 'on-route' | 'measuring' | 'off-duty'
}

export interface TournamentRequest {
  id: string
  tournamentId: string
  sectorId: string
  team: string
  type: 'catch-measurement' | 'rule-report' | 'technical-help' | 'other'
  priority: 'normal' | 'high'
  status: 'new' | 'assigned' | 'resolved'
  createdAt: string
  assignedMarshalId?: string
  actionClientMutationId?: string
  description: string
}

export interface TournamentCatch {
  id: string
  tournamentId: string
  sectorId: string
  team: string
  species: string
  weightKg: number
  lengthCm: number
  caughtAt: string
  measuredAt: string
  verifiedByMarshalId: string
  status: 'waiting' | 'verified' | 'disputed'
  photoLabel: string
  notes: string
  verificationClientMutationId?: string
}

export interface TournamentPenalty {
  id: string
  tournamentId: string
  sectorId: string
  team: string
  type: 'warning' | 'fishing-pause' | 'rod-reduction' | 'review'
  reason: string
  issuedByMarshalId: string
  issuedAt: string
  durationHours?: number
  rodsLess?: number
  startsAt?: string
  endsAt?: string
  status: 'active' | 'served' | 'appealed'
  clientMutationId?: string
}

export interface TournamentRuleCheck {
  id: string
  tournamentId: string
  sectorId: string
  marshalId: string
  checkedAt: string
  result: 'ok' | 'warning' | 'penalty'
  note: string
  clientMutationId?: string
}

export type AlertSeverity = 'storm' | 'info' | 'service' | 'water'
export type PushSubscriptionTopic = 'reservations' | 'service' | 'tournaments' | 'weather'
export type PushSubscriptionPermission = 'denied' | 'granted' | 'unknown'
export type NotificationBroadcastStatus = 'failed' | 'prepared' | 'sent' | 'skipped'
export type NotificationDeliveryProvider = 'disabled' | 'mock' | 'web-push'
export type NotificationDeliveryStatus = 'failed' | 'prepared' | 'sent' | 'skipped'
export type NotificationAudienceRole =
  | 'accountant'
  | 'angler'
  | 'manager'
  | 'marshal'
  | 'owner'
  | 'tournament_organizer'
  | 'tournament_team'
  | 'worker'

export interface NotificationAudience {
  marshalIds?: string[]
  reason?: string
  requestId?: string
  roles?: NotificationAudienceRole[]
  sectorIds?: string[]
  tournamentId?: string
}

export interface Alert {
  id: string
  severity: AlertSeverity
  title: string
  body: string
  createdAt?: string
  endedAt?: string
  expiresAt?: string
  lakeIds?: LakeSlug[]
  validUntil: string
}

export interface PushSubscriptionRecord {
  id: string
  auth?: string
  audienceRole?: NotificationAudienceRole
  createdAt: string
  deviceLabel: string
  enabled: boolean
  endpoint: string
  lastSeenAt: string
  lakeIds?: LakeSlug[]
  marshalId?: string
  p256dh?: string
  permission: PushSubscriptionPermission
  sectorIds?: string[]
  topics: PushSubscriptionTopic[]
  tournamentIds?: string[]
  updatedAt: string
  userAgent: string
}

export interface NotificationBroadcast {
  id: string
  alertId: string
  body: string
  createdAt: string
  createdBy: string
  endedAt?: string
  endedBy?: string
  expiresAt?: string
  message: string
  recipientCount: number
  severity: AlertSeverity
  status: NotificationBroadcastStatus
  targetAudience?: NotificationAudience
  targetLakeIds?: LakeSlug[]
  targetTopics: PushSubscriptionTopic[]
  title: string
  validUntil: string
}

export interface NotificationDeliveryLog {
  id: string
  attemptedAt: string
  broadcastId: string
  deviceLabel: string
  endpoint: string
  message: string
  provider: NotificationDeliveryProvider
  status: NotificationDeliveryStatus
  subscriptionId: string
}

export interface ContactInfo {
  managerName: string
  role: string
  phoneDisplay: string
  phoneHref: string
  reservationNote: string
  phoneHours: string[]
  sourceUrl: string
}

export interface PermitProduct {
  id: string
  label: string
  durationHours: number
  priceEur: number
  note?: string
}

export interface CabinProduct {
  id: string
  label: string
  pegIds: string[]
  capacity: number
  pricePer24hEur: number
  minimumHours: number
  requiresPermitNote: string
  extraPersonFeeEur?: number
  equipment: string[]
}

export interface RequiredEquipmentItem {
  id: string
  label: string
  detail: string
  rentable: boolean
}

export interface RentalItem {
  id: string
  label: string
  category: 'fish-care' | 'comfort' | 'cabin'
  description: string
  stock: number
  priceLabel: string
  recommended: boolean
  active: boolean
}

export interface RentalBooking {
  id: string
  reservationId: string
  rentalItemId: string
  lake: LakeSlug
  from: string
  to: string
  quantity: number
  status: 'requested' | 'reserved' | 'returned' | 'unavailable' | 'cancelled'
  note: string
}

export interface ReservationExtra {
  id: string
  label: string
  description: string
  appliesTo: 'all' | 'cabin'
  priceLabel: string
  lake?: LakeSlug
  source: 'web' | 'proposal'
  active: boolean
}

export interface PaymentMethod {
  id: string
  label: string
  kind: 'cash' | 'bank-transfer' | 'card-gateway'
  enabled: boolean
  settlement: 'on-site' | 'manual' | 'gateway'
  instructions: string
  sortOrder: number
}

export interface InfoSection {
  title: string
  items: string[]
  sourceUrl?: string
}

export interface LakeClosure {
  id: string
  lake: LakeScope
  pegIds?: string[]
  title: string
  reason: 'maintenance' | 'season' | 'spawning' | 'tournament' | 'emergency' | 'pandemic'
  from: string
  to: string
  affectsReservations: boolean
  visibility: 'public' | 'internal'
  organization?: string
  notes: string
}

export interface MapCoordinate {
  label?: string
  role?: MapShapePointRole
  x: number
  y: number
}

export type MapShapePointRole = 'anchor' | 'boundary' | 'entry' | 'regular' | 'service' | 'shore'

export type MapLayerImageFit = 'contain' | 'cover' | 'stretch'

export interface MapLayerImageSettings {
  fit: MapLayerImageFit
  offsetX: number
  offsetY: number
  opacity: number
  scale: number
}

export interface MapLayer {
  id: string
  lake: LakeSlug
  name: string
  kind: 'background' | 'pegs' | 'cabins' | 'sectors' | 'service'
  source?: string
  imageSettings?: MapLayerImageSettings
  visibility: 'public' | 'internal' | 'competition'
  editable: boolean
  enabled: boolean
}

export type MapFacilityType =
  | 'electricity'
  | 'entry'
  | 'first-aid'
  | 'other'
  | 'parking'
  | 'reception'
  | 'shower'
  | 'storage'
  | 'toilet'
  | 'waste'
  | 'wood'

export interface MapFacility {
  id: string
  lake: LakeSlug
  label: string
  type: MapFacilityType
  x: number
  y: number
  visibility: 'public' | 'internal' | 'competition'
  notes: string
}

export type PlaceIssueTargetType = 'facility' | 'lake' | 'peg'
export type PlaceIssueCategory =
  | 'access'
  | 'broken'
  | 'cleanliness'
  | 'lighting'
  | 'missing-equipment'
  | 'safety'
  | 'other'
export type PlaceIssuePriority = 'low' | 'normal' | 'urgent'
export type PlaceIssueStatus = 'new' | 'triaged' | 'in-progress' | 'resolved' | 'rejected'

export interface PlaceIssue {
  id: string
  lake: LakeSlug
  targetType: PlaceIssueTargetType
  targetId?: string
  targetLabel: string
  category: PlaceIssueCategory
  title: string
  description: string
  reporterName?: string
  reporterPhone?: string
  photoLabel?: string
  priority: PlaceIssuePriority
  status: PlaceIssueStatus
  assignedTo?: string
  internalNote: string
  resolutionNote?: string
  createdAt: string
  updatedAt: string
}

export interface MapShape {
  id: string
  lake: LakeSlug
  label: string
  type: 'shoreline' | 'island' | 'zone' | 'sector' | 'service'
  points: MapCoordinate[]
  sectorId?: string
  tournamentId?: string
  visibility: 'public' | 'internal' | 'competition'
  tone: 'water' | 'reed' | 'warning' | 'service' | 'sector'
}

export interface SponsorLogoVariant {
  cropPreset?: SponsorLogoVariantCropPreset
  fileName?: string
  height?: number
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
  placementType: 'homepage' | 'footer' | 'sponsors' | 'tournament' | 'sector' | 'scoreboard'
  sizeBytes?: number
  storagePath?: string
  updatedAt?: string
  url?: string
  variantId?: string
  width?: number
}

export interface SponsorLogoVariantCropPreset {
  focusXPercent: number
  focusYPercent: number
  mode: 'contain' | 'cover'
  paddingPercent: number
  sourceFileName?: string
  sourceHeight?: number
  sourceWidth?: number
}

export interface Sponsor {
  id: string
  name: string
  tier: 'main' | 'partner' | 'sector' | 'tournament'
  logoText: string
  logoAssetId?: string
  logoFileName?: string
  logoHeight?: number
  logoMimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
  logoSourceAssetId?: string
  logoSourceFileName?: string
  logoSourceHeight?: number
  logoSourceMimeType?: 'image/jpeg' | 'image/png' | 'image/webp'
  logoSourceSizeBytes?: number
  logoSourceStoragePath?: string
  logoSourceUpdatedAt?: string
  logoSourceUrl?: string
  logoSourceWidth?: number
  logoSizeBytes?: number
  logoStoragePath?: string
  logoUpdatedAt?: string
  logoUrl?: string
  logoVariants?: SponsorLogoVariant[]
  logoWidth?: number
  website?: string
  description: string
  placement: string
  placementType?: 'homepage' | 'footer' | 'sponsors' | 'tournament' | 'sector' | 'scoreboard'
  sectorId?: string
  sortOrder?: number
  tournamentId?: string
  validFrom?: string
  validTo?: string
  active: boolean
}

export type AuditArea = 'accounts' | 'reservations' | 'rentals' | 'catches' | 'fish' | 'issues' | 'logbooks' | 'tournaments' | 'map' | 'sponsors' | 'system'
export type AuditActorRole =
  | 'owner'
  | 'manager'
  | 'tournament_organizer'
  | 'marshal'
  | 'tournament_team'
  | 'accountant'
  | 'worker'
  | 'angler'
  | 'system'
export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditEvent {
  id: string
  action: string
  actorId: string
  actorLabel: string
  actorRole: AuditActorRole
  area: AuditArea
  createdAt: string
  details: Record<string, string | number | boolean | null | string[]>
  entityId: string
  entityLabel: string
  entityType: string
  lake?: LakeSlug
  severity: AuditSeverity
  summary: string
  tournamentId?: string
}

export const contactInfo: ContactInfo = {
  managerName: 'František Danóci',
  role: 'správca štrkoviska',
  phoneDisplay: '0911 298 702',
  phoneHref: '+421911298702',
  reservationNote:
    'Rezervácie miest prijíma správca telefonicky pondelok až piatok od 9:00 do 14:00. Prevádzkové otázky pri vode riešte cez víkend na rovnakom čísle.',
  phoneHours: ['Po-Pi 9:00-14:00 rezervácie', 'So-Ne 7:00-18:00 prevádzkový kontakt'],
  sourceUrl: 'https://strkoviskokocka.sk/strkovisko-velky-cetin/home/',
}

export const paymentMethods: PaymentMethod[] = [
  {
    id: 'cash-on-site',
    label: 'Hotovosť na mieste',
    kind: 'cash',
    enabled: true,
    settlement: 'on-site',
    instructions: 'Platba pri príchode po potvrdení rezervácie správcom.',
    sortOrder: 1,
  },
  {
    id: 'bank-transfer',
    label: 'Prevod na účet',
    kind: 'bank-transfer',
    enabled: true,
    settlement: 'manual',
    instructions: 'Správca pošle sumu a variabilný symbol po schválení rezervácie.',
    sortOrder: 2,
  },
  {
    id: 'card-gateway',
    label: 'Platobná brána',
    kind: 'card-gateway',
    enabled: false,
    settlement: 'gateway',
    instructions: 'Pripravené ako budúci voliteľný modul, zatiaľ vypnuté.',
    sortOrder: 3,
  },
]

export const permitProducts: PermitProduct[] = [
  {
    id: 'permit-12h',
    label: '12-hodinová povolenka',
    durationHours: 12,
    priceEur: 15,
  },
  {
    id: 'permit-24h',
    label: '24-hodinová povolenka',
    durationHours: 24,
    priceEur: 30,
  },
  {
    id: 'permit-48h',
    label: '48-hodinová povolenka',
    durationHours: 48,
    priceEur: 60,
    note: 'Minimálna dĺžka pri rezerváciách cez týždeň a pri chate.',
  },
]

export const cabinProducts: CabinProduct[] = [
  {
    id: 'large-cabin',
    label: 'Veľká chata 3 alebo 6',
    pegIds: ['vc-03', 'vc-06'],
    capacity: 4,
    pricePer24hEur: 70,
    minimumHours: 48,
    requiresPermitNote: 'Rezervácia chaty je možná pri minimálne dvoch 48-hodinových povolenkách.',
    extraPersonFeeEur: 10,
    equipment: ['4 postele', 'kúpeľňa so sprchovým kútom', 'WC', 'kompletne vybavená kuchyňa', 'televízor'],
  },
  {
    id: 'small-cabin',
    label: 'Malá chata 9 alebo 10',
    pegIds: ['vc-09', 'vc-10'],
    capacity: 2,
    pricePer24hEur: 30,
    minimumHours: 48,
    requiresPermitNote: 'Rezervácia chaty je možná pri minimálne dvoch 48-hodinových povolenkách.',
    equipment: ['2 postele', 'elektrina', 'elektrický ohrievač', 'stolík'],
  },
]

export const requiredEquipment: RequiredEquipmentItem[] = [
  {
    id: 'landing-net',
    label: 'Podberák',
    detail: 'Povinný podberák so šírkou ramena minimálne 1 m.',
    rentable: true,
  },
  {
    id: 'fish-cradle',
    label: 'Vanička alebo podložka pod rybu',
    detail: 'Musí byť pripravená pri love a pred použitím navlhčená.',
    rentable: true,
  },
  {
    id: 'disinfection',
    label: 'Dezinfekčný prostriedok',
    detail: 'Povinný prostriedok na ošetrenie poranených rýb.',
    rentable: true,
  },
  {
    id: 'pean',
    label: 'Pean',
    detail: 'Povinná pomôcka pri šetrnom vyberaní háčika.',
    rentable: true,
  },
  {
    id: 'ticket',
    label: 'Platná vstupenka',
    detail: 'Loviaci sa musí vedieť preukázať platnou povolenkou pri kontrole.',
    rentable: false,
  },
]

export const rentalItems: RentalItem[] = [
  {
    id: 'landing-net-rental',
    label: 'Podberák 1 m+',
    category: 'fish-care',
    description: 'Požičanie povinného veľkého podberáka k rezervácii.',
    stock: 6,
    priceLabel: 'cena po potvrdení správcom',
    recommended: true,
    active: true,
  },
  {
    id: 'fish-cradle-rental',
    label: 'Vanička / podložka pod rybu',
    category: 'fish-care',
    description: 'Vhodné pre rybárov, ktorí neprídu s vlastnou výbavou.',
    stock: 6,
    priceLabel: 'cena po potvrdení správcom',
    recommended: true,
    active: true,
  },
  {
    id: 'weigh-sling',
    label: 'Vážiaci sak',
    category: 'fish-care',
    description: 'Pomôcka pre šetrné váženie a evidenciu úlovku.',
    stock: 4,
    priceLabel: 'cena po potvrdení správcom',
    recommended: false,
    active: true,
  },
  {
    id: 'fish-care-kit',
    label: 'Dezinfekcia a pean',
    category: 'fish-care',
    description: 'Rezervácia základných pomôcok, ak si ich rybár zabudne priniesť.',
    stock: 8,
    priceLabel: 'cena po potvrdení správcom',
    recommended: false,
    active: true,
  },
  {
    id: 'extension-cable',
    label: 'Predlžovací kábel k chate',
    category: 'cabin',
    description: 'Doplnok pre pobyt v chate podľa dostupnosti.',
    stock: 3,
    priceLabel: 'cena po potvrdení správcom',
    recommended: false,
    active: true,
  },
]

export const rentalBookings: RentalBooking[] = [
  {
    id: 'rb-1001-net',
    reservationId: 'r-1001',
    rentalItemId: 'landing-net-rental',
    lake: 'velky-cetin',
    from: '2026-05-16',
    to: '2026-05-18',
    quantity: 1,
    status: 'reserved',
    note: 'Potvrdené k víkendovej rezervácii.',
  },
  {
    id: 'rb-1001-cradle',
    reservationId: 'r-1001',
    rentalItemId: 'fish-cradle-rental',
    lake: 'velky-cetin',
    from: '2026-05-16',
    to: '2026-05-18',
    quantity: 1,
    status: 'reserved',
    note: 'Povinná výbava pre hosťa bez vlastnej podložky.',
  },
  {
    id: 'rb-1002-sling',
    reservationId: 'r-1002',
    rentalItemId: 'weigh-sling',
    lake: 'velky-cetin',
    from: '2026-05-17',
    to: '2026-05-24',
    quantity: 2,
    status: 'reserved',
    note: 'Tímová výprava, dve vážiace sady.',
  },
  {
    id: 'rb-1002-extension',
    reservationId: 'r-1002',
    rentalItemId: 'extension-cable',
    lake: 'velky-cetin',
    from: '2026-05-17',
    to: '2026-05-24',
    quantity: 1,
    status: 'reserved',
    note: 'Doplnok k chate 6.',
  },
  {
    id: 'rb-1003-net',
    reservationId: 'r-1003',
    rentalItemId: 'landing-net-rental',
    lake: 'strkovisko-kocka',
    from: '2026-05-16',
    to: '2026-05-17',
    quantity: 1,
    status: 'requested',
    note: 'Čaká na potvrdenie spolu so žiadosťou.',
  },
]

export const reservationExtras: ReservationExtra[] = [
  {
    id: 'wood-crate',
    label: 'Bednička dreva',
    description: 'Doplnok k pobytu pri chate, ak ho správca potvrdí.',
    appliesTo: 'cabin',
    priceLabel: 'podľa aktuálneho cenníka',
    source: 'proposal',
    active: true,
  },
  {
    id: 'grill',
    label: 'Gril',
    description: 'Rezervácia grilu k chate alebo skupinovej výprave.',
    appliesTo: 'cabin',
    priceLabel: 'podľa dostupnosti',
    source: 'proposal',
    active: true,
  },
  {
    id: 'third-rod',
    label: 'Tretí prút',
    description: 'Doplnková služba dostupná po dohode so správcom.',
    appliesTo: 'all',
    priceLabel: 'po dohode so správcom',
    source: 'web',
    active: true,
  },
  {
    id: 'gazebo-kocka',
    label: 'Altánok / akcia na Kocke',
    description: 'Altánok je dostupný po dohode so správcom na firemné akcie, oslavy a večierky.',
    appliesTo: 'all',
    priceLabel: 'cena dohodou',
    lake: 'strkovisko-kocka',
    source: 'web',
    active: true,
  },
]

export const infoSections: InfoSection[] = [
  {
    title: 'Prevádzka Veľký Cetín',
    items: [
      'Žiadosť o rezerváciu môžete odoslať cez aplikáciu alebo dohodnúť telefonicky so správcom.',
      'Správca vybavuje žiadosti pondelok až piatok od 9:00 do 14:00; rezervácia platí až po potvrdení.',
      'Vo Veľkom Cetíne je založenie ohnísk v areáli prísne zakázané.',
      'Návšteva mimo prevádzkových dní je možná po dohode so správcom na minimálne 48 hodín.',
    ],
    sourceUrl: 'https://strkoviskokocka.sk/strkovisko-velky-cetin/home/',
  },
  {
    title: 'Prevádzka Štrkovisko Kocka',
    items: [
      'Žiadosť o rezerváciu môžete odoslať cez aplikáciu alebo dohodnúť telefonicky so správcom.',
      'Správca vybavuje žiadosti pondelok až piatok od 9:00 do 14:00; rezervácia platí až po potvrdení.',
      'Nočná rybačka je možná po dohode so správcom.',
      'Na Kocke je možné prenajať altánok na firemné akcie, oslavy a večierky za cenu dohodou.',
    ],
    sourceUrl: 'https://strkoviskokocka.sk/strkovisko-kocka/home/',
  },
  {
    title: 'Rezervácie Veľký Cetín',
    items: [
      'Víkendová rezervácia platí od ranných hodín.',
      'Pri víkendovej rezervácii sa loviaci musí dostaviť medzi 7:00 a 8:00.',
      'Ak sa v tomto čase nedostaví, musí informovať správcu, inak môže byť rezervácia zrušená.',
      'Cez týždeň je nástup možný od 7:00 do 10:00.',
      'Rybačka cez týždeň je povolená na minimálne 48 hodín.',
    ],
    sourceUrl: 'https://strkoviskokocka.sk/strkovisko-velky-cetin/suhrne-spravy-2-3-2/',
  },
  {
    title: 'Podmienky rybolovu Veľký Cetín',
    items: [
      'Loviť je povolené iba z brehu rybárskym prútom s navijakom.',
      'Pri vyťahovaní ryby je povinné použiť podberák a vaničku alebo podložku.',
      'Vanička musí byť pred použitím navlhčená.',
      'Sakovanie rýb je zakázané.',
      'Fotografovanie rýb je povolené výhradne nad navlhčenou vaničkou.',
      'Rybu nie je dovolené pokladať na zem.',
    ],
    sourceUrl: 'https://strkoviskokocka.sk/strkovisko-velky-cetin/suhrne-spravy-2-4-2-2/',
  },
]

export const lakeClosures: LakeClosure[] = [
  {
    id: 'closure-winter-2026',
    lake: 'all',
    title: 'Zimná prevádzková prestávka',
    reason: 'season',
    from: '2026-12-15',
    to: '2027-02-15',
    affectsReservations: true,
    visibility: 'public',
    notes: 'Defaultná sezónna uzávierka pre celé stredisko. Termíny potvrdí správca.',
  },
  {
    id: 'closure-spawning-2026',
    lake: 'velky-cetin',
    title: 'Obdobie neresu a šetrného režimu',
    reason: 'spawning',
    from: '2026-05-01',
    to: '2026-05-20',
    affectsReservations: true,
    visibility: 'public',
    notes: 'Rezervácie sú zastavené alebo schvaľované individuálne podľa stavu rýb.',
  },
  {
    id: 'closure-eccj-2026',
    lake: 'velky-cetin',
    title: 'European Carp Cup Junior',
    reason: 'tournament',
    from: '2026-08-21',
    to: '2026-08-25',
    affectsReservations: true,
    visibility: 'public',
    organization: 'ECCJ organizátori',
    notes: 'Bežné rezervácie sú blokované. Organizátor môže používať súťažný modul Rybolov Cetín.',
  },
  {
    id: 'closure-cabin-maintenance',
    lake: 'velky-cetin',
    pegIds: ['vc-10'],
    title: 'Údržba móla pri chate 10',
    reason: 'maintenance',
    from: '2026-05-16',
    to: '2026-05-20',
    affectsReservations: true,
    visibility: 'internal',
    notes: 'Interný servisný záznam, ktorý blokuje vybrané miesto v admin kalendári.',
  },
]

export const mapLayers: MapLayer[] = [
  {
    id: 'layer-vc-background',
    lake: 'velky-cetin',
    name: 'Podklad jazera',
    kind: 'background',
    source: '/images/source-web/velky-cetin-map-original.jpg',
    imageSettings: {
      fit: 'cover',
      offsetX: 0,
      offsetY: 0,
      opacity: 0.9,
      scale: 1,
    },
    visibility: 'public',
    editable: false,
    enabled: true,
  },
  {
    id: 'layer-vc-pegs',
    lake: 'velky-cetin',
    name: 'Lovné miesta',
    kind: 'pegs',
    visibility: 'public',
    editable: true,
    enabled: true,
  },
  {
    id: 'layer-vc-cabins',
    lake: 'velky-cetin',
    name: 'Chaty',
    kind: 'cabins',
    visibility: 'public',
    editable: true,
    enabled: true,
  },
  {
    id: 'layer-vc-sectors',
    lake: 'velky-cetin',
    name: 'Súťažné sektory',
    kind: 'sectors',
    visibility: 'competition',
    editable: true,
    enabled: false,
  },
  {
    id: 'layer-vc-service',
    lake: 'velky-cetin',
    name: 'Servis a uzávierky',
    kind: 'service',
    visibility: 'internal',
    editable: true,
    enabled: true,
  },
  {
    id: 'layer-sk-background',
    lake: 'strkovisko-kocka',
    name: 'Generovaný podklad',
    kind: 'background',
    imageSettings: {
      fit: 'cover',
      offsetX: 0,
      offsetY: 0,
      opacity: 0.9,
      scale: 1,
    },
    visibility: 'public',
    editable: false,
    enabled: true,
  },
  {
    id: 'layer-sk-pegs',
    lake: 'strkovisko-kocka',
    name: 'Lovné miesta',
    kind: 'pegs',
    visibility: 'public',
    editable: true,
    enabled: true,
  },
  {
    id: 'layer-sk-service',
    lake: 'strkovisko-kocka',
    name: 'Servisné body',
    kind: 'service',
    visibility: 'internal',
    editable: true,
    enabled: false,
  },
]

export const mapShapes: MapShape[] = [
  {
    id: 'shape-vc-island',
    lake: 'velky-cetin',
    label: 'Ostrov',
    type: 'island',
    tone: 'reed',
    visibility: 'public',
    points: [
      { x: 41, y: 38 },
      { x: 54, y: 36 },
      { x: 62, y: 45 },
      { x: 58, y: 54 },
      { x: 45, y: 55 },
      { x: 36, y: 47 },
    ],
  },
  {
    id: 'shape-vc-spawning-zone',
    lake: 'velky-cetin',
    label: 'Šetrný režim počas neresu',
    type: 'zone',
    tone: 'warning',
    visibility: 'internal',
    points: [
      { x: 15, y: 24 },
      { x: 36, y: 18 },
      { x: 42, y: 35 },
      { x: 22, y: 45 },
    ],
  },
  {
    id: 'shape-vc-sector-band',
    lake: 'velky-cetin',
    label: 'Súťažná línia sektorov A-B',
    type: 'sector',
    tone: 'sector',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 68, y: 30 },
      { x: 83, y: 56 },
      { x: 57, y: 66 },
      { x: 45, y: 40 },
    ],
  },
  {
    id: 'shape-vc-sector-a1',
    lake: 'velky-cetin',
    label: 'Sektor A1',
    type: 'sector',
    tone: 'sector',
    sectorId: 'a1',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 72, y: 58 },
      { x: 84, y: 58 },
      { x: 84, y: 70 },
      { x: 72, y: 70 },
    ],
  },
  {
    id: 'shape-vc-sector-a2',
    lake: 'velky-cetin',
    label: 'Sektor A2',
    type: 'sector',
    tone: 'sector',
    sectorId: 'a2',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 68, y: 42 },
      { x: 80, y: 42 },
      { x: 80, y: 54 },
      { x: 68, y: 54 },
    ],
  },
  {
    id: 'shape-vc-sector-a3',
    lake: 'velky-cetin',
    label: 'Sektor A3',
    type: 'sector',
    tone: 'sector',
    sectorId: 'a3',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 55, y: 56 },
      { x: 67, y: 56 },
      { x: 67, y: 68 },
      { x: 55, y: 68 },
    ],
  },
  {
    id: 'shape-vc-sector-b1',
    lake: 'velky-cetin',
    label: 'Sektor B1',
    type: 'sector',
    tone: 'sector',
    sectorId: 'b1',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 42, y: 53 },
      { x: 54, y: 53 },
      { x: 54, y: 65 },
      { x: 42, y: 65 },
    ],
  },
  {
    id: 'shape-vc-sector-b4',
    lake: 'velky-cetin',
    label: 'Sektor B4',
    type: 'sector',
    tone: 'sector',
    sectorId: 'b4',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 37, y: 22 },
      { x: 49, y: 22 },
      { x: 49, y: 34 },
      { x: 37, y: 34 },
    ],
  },
  {
    id: 'shape-vc-sector-c2',
    lake: 'velky-cetin',
    label: 'Sektor C2',
    type: 'sector',
    tone: 'sector',
    sectorId: 'c2',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 19, y: 62 },
      { x: 31, y: 62 },
      { x: 31, y: 74 },
      { x: 19, y: 74 },
    ],
  },
  {
    id: 'shape-vc-sector-d3',
    lake: 'velky-cetin',
    label: 'Sektor D3',
    type: 'sector',
    tone: 'sector',
    sectorId: 'd3',
    tournamentId: 'eccj-2026',
    visibility: 'competition',
    points: [
      { x: 9, y: 33 },
      { x: 21, y: 33 },
      { x: 21, y: 45 },
      { x: 9, y: 45 },
    ],
  },
  {
    id: 'shape-vc-service-cabin-10',
    lake: 'velky-cetin',
    label: 'Servisné okolie chaty 10',
    type: 'service',
    tone: 'service',
    visibility: 'internal',
    points: [
      { x: 18, y: 55 },
      { x: 29, y: 55 },
      { x: 31, y: 67 },
      { x: 18, y: 70 },
    ],
  },
  {
    id: 'shape-sk-core',
    lake: 'strkovisko-kocka',
    label: 'Hlavná vodná plocha Kocka',
    type: 'shoreline',
    tone: 'water',
    visibility: 'public',
    points: [
      { x: 13, y: 44 },
      { x: 25, y: 25 },
      { x: 54, y: 21 },
      { x: 84, y: 39 },
      { x: 78, y: 66 },
      { x: 43, y: 72 },
      { x: 18, y: 61 },
    ],
  },
]

export const mapFacilities: MapFacility[] = [
  {
    id: 'facility-vc-reception',
    lake: 'velky-cetin',
    label: 'Recepcia a nástup',
    type: 'reception',
    x: 9,
    y: 72,
    visibility: 'public',
    notes: 'Prvé miesto kontaktu pri príchode, kontrola rezervácie a povolenky.',
  },
  {
    id: 'facility-vc-entry',
    lake: 'velky-cetin',
    label: 'Vjazd k revíru',
    type: 'entry',
    x: 6,
    y: 66,
    visibility: 'public',
    notes: 'Vjazd pre rybárov, zásobovanie a obsluhu revíru.',
  },
  {
    id: 'facility-vc-toilet',
    lake: 'velky-cetin',
    label: 'WC',
    type: 'toilet',
    x: 13,
    y: 69,
    visibility: 'public',
    notes: 'Verejne dostupné WC pri zázemí revíru.',
  },
  {
    id: 'facility-vc-shower',
    lake: 'velky-cetin',
    label: 'Sprchy',
    type: 'shower',
    x: 16,
    y: 72,
    visibility: 'public',
    notes: 'Sprchy pre pobytové rezervácie a súťažné tímy.',
  },
  {
    id: 'facility-vc-wood',
    lake: 'velky-cetin',
    label: 'Drevo',
    type: 'wood',
    x: 21,
    y: 70,
    visibility: 'internal',
    notes: 'Sklad bedničiek dreva a doplnkov k chatám.',
  },
  {
    id: 'facility-vc-electric',
    lake: 'velky-cetin',
    label: 'Elektrická rozvodňa',
    type: 'electricity',
    x: 29,
    y: 68,
    visibility: 'internal',
    notes: 'Technický bod pre obsluhu a servis.',
  },
  {
    id: 'facility-vc-storage',
    lake: 'velky-cetin',
    label: 'Sklad výbavy',
    type: 'storage',
    x: 11,
    y: 64,
    visibility: 'internal',
    notes: 'Podberáky, podložky, vážiace saky a servisná výbava.',
  },
  {
    id: 'facility-sk-parking',
    lake: 'strkovisko-kocka',
    label: 'Parkovanie Kocka',
    type: 'parking',
    x: 11,
    y: 72,
    visibility: 'public',
    notes: 'Parkovanie pri menšom jazere.',
  },
  {
    id: 'facility-sk-waste',
    lake: 'strkovisko-kocka',
    label: 'Odpad',
    type: 'waste',
    x: 18,
    y: 70,
    visibility: 'public',
    notes: 'Zberné miesto na odpad po výprave.',
  },
]

export const sponsors: Sponsor[] = [
  {
    id: 'sponsor-carpgear',
    name: 'CarpGear Pro',
    tier: 'main',
    logoText: 'CG',
    website: 'https://example.com',
    description: 'Hlavný partner súťažného merania, váženia a cien pre víťazov.',
    placement: 'homepage, súťaže, výsledková tabuľa',
    placementType: 'homepage',
    sortOrder: 1,
    validFrom: '2026-01-01',
    active: true,
  },
  {
    id: 'sponsor-baits',
    name: 'Danube Baits',
    tier: 'tournament',
    logoText: 'DB',
    website: 'https://example.com',
    description: 'Partner pretekov a tímových cien za najväčšiu rybu.',
    placement: 'European Carp Cup Junior',
    placementType: 'tournament',
    sortOrder: 2,
    tournamentId: 'eccj-2026',
    validFrom: '2026-08-01',
    validTo: '2026-08-31',
    active: true,
  },
  {
    id: 'sponsor-local',
    name: 'Obecný partner',
    tier: 'partner',
    logoText: 'OP',
    description: 'Lokálny partner prevádzky a komunitných akcií pri vode.',
    placement: 'kontakt, info, footer',
    placementType: 'footer',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'sponsor-sector',
    name: 'Sektor B4 partner',
    tier: 'sector',
    logoText: 'B4',
    description: 'Ukážka sponzora naviazaného na konkrétny sektor alebo lovné miesto.',
    placement: 'súťažná mapa, sektor B4',
    placementType: 'sector',
    sectorId: 'b4',
    sortOrder: 4,
    tournamentId: 'eccj-2026',
    active: false,
  },
]

export const lakes: Lake[] = [
  {
    slug: 'velky-cetin',
    name: 'Veľký Cetín',
    areaHa: 22,
    mode: 'chyť a pusť',
    summary:
      'Väčšie jazero s ostrovom, lovnými miestami po obvode a sektormi vhodnými aj pre tímové preteky.',
    highlights: ['22 ha vodnej plochy', 'lovné miesta pri vode', 'chaty pri miestach 3, 6, 9 a 10'],
    facilities: [
      'parkovanie pri revíri',
      'chaty pre viacdňový pobyt',
      'vhodné pre kaprárske súťaže',
    ],
    fishStock: ['kapor 5-15 kg', 'kapor 15-25 kg', 'ďalšie druhy doplniť správcom'],
    rules: [
      'režim chyť a pusť',
      'povinná veľká podložka, podberák a dezinfekcia',
      'rezervácie víkend, týždeň alebo podľa dohody',
    ],
    image: '/images/source-web/velky-cetin-card.png',
    galleryImages: [
      '/images/source-web/velky-cetin-slide-a1.jpg',
      '/images/source-web/velky-cetin-slide-a2.jpg',
      '/images/source-web/velky-cetin-slide-a3.jpg',
      '/images/source-web/velky-cetin-slide-a4.jpg',
    ],
    mapImage: '/images/source-web/velky-cetin-map-original.jpg',
  },
  {
    slug: 'strkovisko-kocka',
    name: 'Štrkovisko Kocka',
    areaHa: 3,
    mode: 'súkromný revír',
    summary:
      'Menšie susedné jazero s komornejším charakterom, vhodné na krátke výpravy, bodové rezervácie a rýchlu obsadenosť.',
    highlights: [
      '3 ha vodnej plochy',
      'susedí s Veľkým Cetínom',
      'možnosť prenájmu altánku po dohode',
    ],
    facilities: [
      'lovné miesta pri brehu',
      'prístup autom až k lovnému miestu',
      'dobrá dostupnosť z obce',
    ],
    fishStock: ['kapor 3-15 kg', 'násady 16-18 kg', 'ďalšie druhy doplniť správcom'],
    rules: [
      'rezervácia lovného miesta pred príchodom',
      'zápis úlovku po zdolaní ryby',
      'ohľaduplný pohyb medzi dvoma susednými vodami',
    ],
    image: '/images/source-web/strkovisko-kocka.png',
    galleryImages: [
      '/images/source-web/kocka-slide-2.jpg',
      '/images/source-web/kocka-slide-3.jpg',
      '/images/source-web/kocka-slide-4.jpg',
      '/images/source-web/kocka-slide-5.jpg',
    ],
  },
]

export const placeIssues: PlaceIssue[] = [
  {
    id: 'issue-20260610-vc-03-light',
    lake: 'velky-cetin',
    targetType: 'peg',
    targetId: 'vc-03',
    targetLabel: 'Chata 3',
    category: 'lighting',
    title: 'Nesvieti vonkajšie svetlo pri chate',
    description: 'Pri vstupe do chaty nesvieti svetlo, večer je zle vidieť na schody.',
    reporterName: 'Marek H.',
    reporterPhone: '+421 900 456 123',
    priority: 'normal',
    status: 'triaged',
    assignedTo: 'Brigádnik',
    internalNote: 'Skontrolovať poistku a žiarovku pri najbližšej obchôdzke.',
    createdAt: '2026-06-10T18:40:00.000Z',
    updatedAt: '2026-06-11T08:20:00.000Z',
  },
  {
    id: 'issue-20260612-storage-net',
    lake: 'velky-cetin',
    targetType: 'facility',
    targetId: 'facility-vc-storage',
    targetLabel: 'Sklad výbavy',
    category: 'missing-equipment',
    title: 'Chýba rezervný podberák',
    description: 'V sklade už nie je voľný veľký podberák, pri rezerváciách sa uvádza dostupnosť.',
    reporterName: 'Správca',
    priority: 'urgent',
    status: 'in-progress',
    assignedTo: 'Prevádzka',
    internalNote: 'Dočasne znížiť sklad a overiť vrátenie pri poslednej rezervácii.',
    createdAt: '2026-06-12T09:15:00.000Z',
    updatedAt: '2026-06-12T11:00:00.000Z',
  },
]

export const pegs: Peg[] = [
  {
    id: 'vc-01',
    lake: 'velky-cetin',
    label: 'Miesto 1',
    type: 'shore',
    x: 76,
    y: 61,
    capacity: 2,
    status: 'reserved',
    notes: 'Dlhý hod na otvorenú vodu, dobré pri stabilnom tlaku.',
  },
  {
    id: 'vc-02',
    lake: 'velky-cetin',
    label: 'Miesto 2',
    type: 'shore',
    x: 68,
    y: 48,
    capacity: 2,
    status: 'free',
    notes: 'Prístupné miesto s rýchlym presunom k sektoru A2.',
  },
  {
    id: 'vc-03',
    lake: 'velky-cetin',
    label: 'Chata 3',
    type: 'cabin',
    requiresCabinReservation: true,
    x: 58,
    y: 56,
    capacity: 3,
    status: 'weekend-free',
    notes: 'Chata pri vode, vhodná na víkendový pobyt.',
  },
  {
    id: 'vc-04',
    lake: 'velky-cetin',
    label: 'Miesto 4',
    type: 'shore',
    x: 52,
    y: 42,
    capacity: 2,
    status: 'free',
    notes: 'Hrana pri stredovej časti jazera.',
  },
  {
    id: 'vc-05',
    lake: 'velky-cetin',
    label: 'Miesto 5',
    type: 'shore',
    x: 44,
    y: 54,
    capacity: 2,
    status: 'reserved',
    notes: 'Častý výskyt väčších rýb pri zmenách vetra.',
  },
  {
    id: 'vc-06',
    lake: 'velky-cetin',
    label: 'Chata 6',
    type: 'cabin',
    requiresCabinReservation: true,
    x: 37,
    y: 36,
    capacity: 4,
    status: 'reserved',
    notes: 'Väčšia chata, vhodná pre dlhšiu výpravu.',
  },
  {
    id: 'vc-09',
    lake: 'velky-cetin',
    label: 'Chata 9',
    type: 'cabin',
    requiresCabinReservation: true,
    x: 26,
    y: 46,
    capacity: 2,
    status: 'free',
    notes: 'Menšia chata pri ľavej časti revíru.',
  },
  {
    id: 'vc-10',
    lake: 'velky-cetin',
    label: 'Chata 10',
    type: 'cabin',
    requiresCabinReservation: true,
    x: 23,
    y: 61,
    capacity: 2,
    status: 'maintenance',
    notes: 'Dočasne blokované kvôli údržbe móla.',
  },
  {
    id: 'sk-01',
    lake: 'strkovisko-kocka',
    label: 'Kocka 1',
    type: 'shore',
    x: 17,
    y: 48,
    capacity: 2,
    status: 'free',
    notes: 'Krátke vychádzky a rýchly prístup od parkovania.',
  },
  {
    id: 'sk-02',
    lake: 'strkovisko-kocka',
    label: 'Kocka 2',
    type: 'shore',
    x: 39,
    y: 34,
    capacity: 2,
    status: 'reserved',
    notes: 'Tichšia zátoka, vhodná pre jemnejšie montáže.',
  },
  {
    id: 'sk-03',
    lake: 'strkovisko-kocka',
    label: 'Kocka 3',
    type: 'shore',
    x: 62,
    y: 55,
    capacity: 2,
    status: 'weekend-free',
    notes: 'Dobré miesto pri miernom vetre od polí.',
  },
  {
    id: 'sk-04',
    lake: 'strkovisko-kocka',
    label: 'Kocka 4',
    type: 'shore',
    x: 78,
    y: 43,
    capacity: 2,
    status: 'free',
    notes: 'Miesto s dobrým prehľadom cez celé menšie jazero.',
  },
]

export const reservations: Reservation[] = [
  {
    id: 'r-1001',
    lake: 'velky-cetin',
    pegId: 'vc-01',
    guest: 'Marek H.',
    contactEmail: 'marek.h@example.com',
    contactPhone: '+421 900 123 456',
    from: '2026-05-16',
    to: '2026-05-18',
    type: 'weekend',
    status: 'confirmed',
    permitId: 'permit-48h',
    rentalIds: ['landing-net-rental', 'fish-cradle-rental'],
    extraIds: ['third-rod'],
    paymentMethodId: 'cash-on-site',
    paymentStatus: 'pending',
    internalNote: 'Hosť potvrdený telefonicky, výbavu prevziať pri nástupe.',
    source: 'phone',
  },
  {
    id: 'r-1002',
    lake: 'velky-cetin',
    pegId: 'vc-06',
    guest: 'Tím Nitra Carp',
    contactEmail: 'nitra-carp@example.com',
    contactPhone: '+421 905 222 111',
    from: '2026-05-17',
    to: '2026-05-24',
    type: 'week',
    status: 'confirmed',
    permitId: 'permit-48h',
    cabinProductId: 'large-cabin',
    rentalIds: ['weigh-sling', 'extension-cable'],
    extraIds: ['wood-crate', 'grill'],
    paymentMethodId: 'bank-transfer',
    paymentStatus: 'paid',
    internalNote: 'Tímová výprava na chate 6, preveriť drevo pred príchodom.',
    source: 'admin',
  },
  {
    id: 'r-1003',
    lake: 'strkovisko-kocka',
    pegId: 'sk-02',
    guest: 'Peter B.',
    contactEmail: 'peter.b@example.com',
    contactPhone: '+421 908 444 321',
    from: '2026-05-16',
    to: '2026-05-17',
    type: 'day',
    status: 'pending',
    permitId: 'permit-24h',
    rentalIds: ['landing-net-rental'],
    extraIds: ['gazebo-kocka'],
    paymentMethodId: 'cash-on-site',
    paymentStatus: 'unpaid',
    internalNote: 'Nová webová žiadosť, treba potvrdiť telefonicky a preveriť altánok.',
    source: 'web',
  },
]

export const catches: CatchRecord[] = [
  {
    id: 'c-2401',
    angler: 'Marek H.',
    lake: 'velky-cetin',
    pegId: 'vc-05',
    species: 'Kapor',
    weightKg: 18.6,
    lengthCm: 92,
    bait: 'scopex boilies 20 mm',
    caughtAt: '2026-05-16T05:40:00+02:00',
    released: true,
    photoLabel: 'bočný záber na podložke',
    notes: 'Záber pri rozvidnení, montáž položená na hrane.',
    status: 'approved',
    weather: {
      airTempC: 14.2,
      cloudCoverPct: 45,
      condition: 'polooblačno',
      pressureHpa: 1016,
      pressureTrend: 'stable',
      source: 'mock',
      waterTempC: 17.8,
      windDirection: 'SV',
      windKph: 9,
    },
  },
  {
    id: 'c-2402',
    angler: 'Lenka R.',
    lake: 'strkovisko-kocka',
    pegId: 'sk-03',
    species: 'Amur',
    weightKg: 12.1,
    lengthCm: 86,
    bait: 'kukurica + plávajúca pena',
    caughtAt: '2026-05-15T19:10:00+02:00',
    released: true,
    photoLabel: 'fotka s metrom a rybou',
    notes: 'Ryba sa držala pri kraji po oteplení vody.',
    status: 'approved',
    weather: {
      airTempC: 18.9,
      cloudCoverPct: 20,
      condition: 'jasno',
      pressureHpa: 1012,
      pressureTrend: 'falling',
      source: 'mock',
      waterTempC: 19.1,
      windDirection: 'JZ',
      windKph: 6,
    },
  },
  {
    id: 'c-2403',
    angler: 'Tím Junior A',
    lake: 'velky-cetin',
    pegId: 'vc-03',
    species: 'Kapor',
    weightKg: 9.4,
    lengthCm: 74,
    bait: 'krill dumbell',
    caughtAt: '2026-05-14T23:25:00+02:00',
    released: true,
    photoLabel: 'nočný úlovok pri chate',
    notes: 'Dáta vhodné na neskoršie porovnanie rastu podľa fotky.',
    status: 'approved',
    weather: {
      airTempC: 12.7,
      cloudCoverPct: 70,
      condition: 'oblačno',
      pressureHpa: 1009,
      pressureTrend: 'rising',
      source: 'mock',
      waterTempC: 17.2,
      windDirection: 'S',
      windKph: 4,
    },
  },
]

export const catchPhotos: CatchPhoto[] = []

export const tripLogbookModeLabels = {
  personal: 'osobný',
  group: 'partia',
  competition: 'súťažný tím',
} as const

export const tripLogbookStatusLabels = {
  draft: 'rozpracovaný',
  active: 'aktívny',
  closed: 'uzavretý',
} as const

export const tripLogbooks: TripLogbook[] = [
  {
    id: 'logbook-cabin-3-may',
    title: 'Chata 3 - májová výprava',
    lake: 'velky-cetin',
    pegIds: ['vc-03', 'vc-04'],
    from: '2026-05-16T07:00:00+02:00',
    to: '2026-05-18T10:00:00+02:00',
    mode: 'group',
    status: 'active',
    owner: 'Marek H.',
    ownerUserId: 'angler-marek',
    shareCode: 'CETIN-3MAY',
    members: [
      { id: 'member-marek', name: 'Marek H.', role: 'owner', userId: 'angler-marek' },
      { id: 'member-tomas', name: 'Tomáš K.', role: 'member' },
      { id: 'member-lenka', name: 'Lenka R.', role: 'member' },
    ],
    note: 'Skupinová tabuľka pre partiu pri chate. Každý zápis sa dá neskôr spojiť s fotkou a metadátami pre AI.',
  },
  {
    id: 'logbook-kocka-evening',
    title: 'Kocka po práci',
    lake: 'strkovisko-kocka',
    pegIds: ['sk-03'],
    from: '2026-05-17T17:00:00+02:00',
    to: '2026-05-17T22:00:00+02:00',
    mode: 'personal',
    status: 'draft',
    owner: 'Lenka R.',
    ownerUserId: 'angler-lenka',
    shareCode: 'KOCKA-1717',
    members: [{ id: 'member-lenka-kocka', name: 'Lenka R.', role: 'owner', userId: 'angler-lenka' }],
    note: 'Krátka osobná výprava s možnosťou neskoršieho zdieľania so správcom.',
  },
]

export const tripLogbookEntries: TripLogbookEntry[] = [
  {
    id: 'entry-3001',
    logbookId: 'logbook-cabin-3-may',
    angler: 'Marek H.',
    lake: 'velky-cetin',
    pegId: 'vc-03',
    species: 'Kapor',
    weightKg: 11.8,
    lengthCm: 81,
    bait: 'scopex boilies 20 mm',
    caughtAt: '2026-05-16T05:40:00+02:00',
    released: true,
    photoStatus: 'ai-ready',
    verified: true,
  },
  {
    id: 'entry-3002',
    logbookId: 'logbook-cabin-3-may',
    angler: 'Tomáš K.',
    lake: 'velky-cetin',
    pegId: 'vc-04',
    species: 'Kapor',
    weightKg: 7.3,
    lengthCm: 68,
    bait: 'krill dumbell',
    caughtAt: '2026-05-16T21:15:00+02:00',
    released: true,
    photoStatus: 'uploaded',
    verified: false,
  },
  {
    id: 'entry-3003',
    logbookId: 'logbook-cabin-3-may',
    angler: 'Lenka R.',
    lake: 'velky-cetin',
    pegId: 'vc-03',
    species: 'Amur',
    weightKg: 9.6,
    lengthCm: 78,
    bait: 'kukurica + plávajúca pena',
    caughtAt: '2026-05-17T06:05:00+02:00',
    released: true,
    photoStatus: 'missing',
    verified: false,
  },
]

export const tournaments: Tournament[] = [
  {
    id: 'eccj-2026',
    name: 'European Carp Cup Junior',
    lake: 'velky-cetin',
    dateRange: '21. 8. - 25. 8. 2026',
    operationsMode: 'full-dispatch',
    status: 'live',
    sectors: [
      { id: 'a1', label: 'A1', x: 77, y: 64, team: 'Junior Team A', weightKg: 12.4 },
      { id: 'a2', label: 'A2', x: 74, y: 48, team: 'Morava Carp', weightKg: 8.7 },
      { id: 'a3', label: 'A3', x: 61, y: 62, team: 'Karpati Kids', weightKg: 0 },
      { id: 'b1', label: 'B1', x: 48, y: 59, team: 'Nitra Carp', weightKg: 6.2 },
      { id: 'b4', label: 'B4', x: 43, y: 28, team: 'South Lake', weightKg: 0 },
      { id: 'c2', label: 'C2', x: 25, y: 68, team: 'Young Anglers', weightKg: 0 },
      { id: 'd3', label: 'D3', x: 15, y: 39, team: 'Feeder Junior', weightKg: 0 },
    ],
  },
]

export const tournamentRequestTypeLabels = {
  'catch-measurement': 'meranie úlovku',
  'rule-report': 'hlásenie porušenia',
  'technical-help': 'technická pomoc',
  other: 'iné hlásenie',
} as const

export const tournamentRequestStatusLabels = {
  new: 'nové',
  assigned: 'priradené',
  resolved: 'vyriešené',
} as const

export const tournamentTeamRegistrationStatusLabels = {
  approved: 'schválené',
  rejected: 'zamietnuté',
  submitted: 'nová prihláška',
  waitlisted: 'čaká v poradovníku',
} as const

export const tournamentPenaltyTypeLabels = {
  warning: 'napomenutie',
  'fishing-pause': 'stop lovu',
  'rod-reduction': 'menej prútov',
  review: 'na posúdenie',
} as const

export const tournamentMarshalStatusLabels = {
  available: 'voľný',
  'on-route': 'na ceste',
  measuring: 'váži úlovok',
  'off-duty': 'mimo služby',
} as const

export const tournamentMarshals: TournamentMarshal[] = [
  {
    id: 'marshal-1',
    name: 'Peter H.',
    phone: '+421 900 111 201',
    assignedSectorIds: ['a1', 'a2', 'a3'],
    status: 'on-route',
  },
  {
    id: 'marshal-2',
    name: 'Milan K.',
    phone: '+421 900 111 202',
    assignedSectorIds: ['b1', 'b4'],
    status: 'measuring',
  },
  {
    id: 'marshal-3',
    name: 'Jana R.',
    phone: '+421 900 111 203',
    assignedSectorIds: ['c2', 'd3'],
    status: 'available',
  },
]

export const tournamentTeamRegistrations: TournamentTeamRegistration[] = [
  {
    id: 'ttr-1001',
    tournamentId: 'eccj-2026',
    teamName: 'Junior Team A',
    contactName: 'Tomáš Adamec',
    contactPhone: '+421 900 222 101',
    contactEmail: 'junior-a@example.com',
    memberCount: 2,
    city: 'Nitra',
    preferredSectorId: 'a1',
    assignedSectorId: 'a1',
    note: 'Tím má potvrdený štart a sektor A1.',
    status: 'approved',
    createdAt: '12. 5. 2026 18:15',
    reviewedAt: '13. 5. 2026 09:20',
    reviewNote: 'Potvrdené organizátorom.',
  },
  {
    id: 'ttr-1002',
    tournamentId: 'eccj-2026',
    teamName: 'Dolná Nitra Carp',
    contactName: 'Marek Baláž',
    contactPhone: '+421 900 222 102',
    contactEmail: 'dnc@example.com',
    memberCount: 3,
    city: 'Šurany',
    preferredSectorId: 'c2',
    note: 'Preferujú miesto s rýchlym prístupom ku kontrole.',
    status: 'submitted',
    createdAt: 'dnes 09:12',
  },
  {
    id: 'ttr-1003',
    tournamentId: 'eccj-2026',
    teamName: 'River Kids',
    contactName: 'Lenka Rybárová',
    contactPhone: '+421 900 222 103',
    memberCount: 2,
    city: 'Nové Zámky',
    preferredSectorId: 'd3',
    note: 'Čakajú na uvoľnenie sektora alebo náhradný tím.',
    status: 'waitlisted',
    createdAt: 'dnes 10:05',
    reviewedAt: 'dnes 11:00',
    reviewNote: 'Zatiaľ poradovník, kontaktovať pri zmene.',
  },
]

export const tournamentRequests: TournamentRequest[] = [
  {
    id: 'tr-1001',
    tournamentId: 'eccj-2026',
    sectorId: 'a2',
    team: 'Morava Carp',
    type: 'catch-measurement',
    priority: 'high',
    status: 'assigned',
    createdAt: 'dnes 14:12',
    assignedMarshalId: 'marshal-1',
    description: 'Tím žiada príchod kontrolóra k váženiu kapra.',
  },
  {
    id: 'tr-1002',
    tournamentId: 'eccj-2026',
    sectorId: 'b4',
    team: 'South Lake',
    type: 'rule-report',
    priority: 'normal',
    status: 'new',
    createdAt: 'dnes 14:18',
    description: 'Hlásenie možného zavážania mimo vyznačený sektor.',
  },
  {
    id: 'tr-1003',
    tournamentId: 'eccj-2026',
    sectorId: 'd3',
    team: 'Feeder Junior',
    type: 'technical-help',
    priority: 'normal',
    status: 'resolved',
    createdAt: 'dnes 13:50',
    assignedMarshalId: 'marshal-3',
    description: 'Kontrola funkčnosti váhy a potvrdenie náhradného metra.',
  },
]

export const tournamentCatches: TournamentCatch[] = [
  {
    id: 'tc-501',
    tournamentId: 'eccj-2026',
    sectorId: 'a1',
    team: 'Junior Team A',
    species: 'Kapor',
    weightKg: 12.4,
    lengthCm: 88,
    caughtAt: 'dnes 10:42',
    measuredAt: 'dnes 10:57',
    verifiedByMarshalId: 'marshal-1',
    status: 'verified',
    photoLabel: 'fotka na podložke s mierou',
    notes: 'Overené váženie, ryba pustená späť pred kontrolórom.',
  },
  {
    id: 'tc-502',
    tournamentId: 'eccj-2026',
    sectorId: 'a2',
    team: 'Morava Carp',
    species: 'Kapor',
    weightKg: 8.7,
    lengthCm: 76,
    caughtAt: 'dnes 13:58',
    measuredAt: 'čaká',
    verifiedByMarshalId: 'marshal-1',
    status: 'waiting',
    photoLabel: 'tím čaká na rozhodcu',
    notes: 'Tím poslal požiadavku na príchod kontrolóra.',
  },
  {
    id: 'tc-503',
    tournamentId: 'eccj-2026',
    sectorId: 'b1',
    team: 'Nitra Carp',
    species: 'Kapor',
    weightKg: 6.2,
    lengthCm: 69,
    caughtAt: 'dnes 12:21',
    measuredAt: 'dnes 12:33',
    verifiedByMarshalId: 'marshal-2',
    status: 'verified',
    photoLabel: 'váženie pri sektore B1',
    notes: 'Bez námietok.',
  },
]

export const tournamentPenalties: TournamentPenalty[] = [
  {
    id: 'tp-301',
    tournamentId: 'eccj-2026',
    sectorId: 'b4',
    team: 'South Lake',
    type: 'rod-reduction',
    reason: 'Jeden prút bol nahodený mimo povolený limit sektora.',
    issuedByMarshalId: 'marshal-2',
    issuedAt: 'dnes 11:20',
    durationHours: 2,
    rodsLess: 1,
    startsAt: 'dnes 11:30',
    endsAt: 'dnes 13:30',
    status: 'served',
  },
  {
    id: 'tp-302',
    tournamentId: 'eccj-2026',
    sectorId: 'c2',
    team: 'Young Anglers',
    type: 'warning',
    reason: 'Neúplne pripravená podložka pri manipulácii s rybou.',
    issuedByMarshalId: 'marshal-3',
    issuedAt: 'dnes 13:05',
    status: 'active',
  },
]

export const tournamentRuleChecks: TournamentRuleCheck[] = [
  {
    id: 'check-1',
    tournamentId: 'eccj-2026',
    sectorId: 'a1',
    marshalId: 'marshal-1',
    checkedAt: 'dnes 12:10',
    result: 'ok',
    note: 'Montáže, počet prútov a podložka bez porušenia.',
  },
  {
    id: 'check-2',
    tournamentId: 'eccj-2026',
    sectorId: 'b4',
    marshalId: 'marshal-2',
    checkedAt: 'dnes 11:20',
    result: 'penalty',
    note: 'Zistené porušenie limitu sektora, udelený trest o prút menej.',
  },
  {
    id: 'check-3',
    tournamentId: 'eccj-2026',
    sectorId: 'c2',
    marshalId: 'marshal-3',
    checkedAt: 'dnes 13:05',
    result: 'warning',
    note: 'Napomenutie za manipuláciu s rybou.',
  },
]

export const alerts: Alert[] = [
  {
    id: 'a-1',
    severity: 'storm',
    title: 'Výstraha pred búrkou',
    body: 'O 18:30 sa očakáva prechod búrkového pásma. Skontrolujte bivaky, stojany a nepoužívajte prúty počas bleskov.',
    validUntil: 'dnes 21:00',
  },
  {
    id: 'a-2',
    severity: 'water',
    title: 'Zvýšený vietor na otvorenej vode',
    body: 'Na Veľkom Cetíne môže byť horšia ovládateľnosť člnov a zavážacích lodiek pri miestach A1-A4.',
    validUntil: 'dnes 20:00',
  },
  {
    id: 'a-3',
    severity: 'service',
    title: 'Údržba chaty 10',
    body: 'Chata 10 je dočasne blokovaná. Rezervácie presúvame na najbližšie voľné miesto.',
    validUntil: 'pondelka',
  },
]

export const occupancyLegend = {
  free: 'voľné',
  reserved: 'obsadené',
  'weekend-free': 'voľný víkend',
  maintenance: 'údržba',
} as const

export const placeIssueCategoryLabels: Record<PlaceIssueCategory, string> = {
  access: 'prístup',
  broken: 'pokazené',
  cleanliness: 'čistota',
  lighting: 'osvetlenie',
  'missing-equipment': 'chýba výbava',
  other: 'iné',
  safety: 'bezpečnosť',
}

export const placeIssuePriorityLabels: Record<PlaceIssuePriority, string> = {
  low: 'nízka',
  normal: 'bežná',
  urgent: 'urgentná',
}

export const placeIssueStatusLabels: Record<PlaceIssueStatus, string> = {
  'in-progress': 'rieši sa',
  new: 'nové',
  rejected: 'zamietnuté',
  resolved: 'vyriešené',
  triaged: 'prijaté',
}

export const placeIssueTargetTypeLabels: Record<PlaceIssueTargetType, string> = {
  facility: 'servisný bod',
  lake: 'jazero',
  peg: 'lovné miesto',
}

export function getLakeName(slug: LakeSlug) {
  return lakes.find((lake) => lake.slug === slug)?.name ?? slug
}

export function getPegLabel(id: string) {
  return pegs.find((peg) => peg.id === id)?.label ?? id
}
