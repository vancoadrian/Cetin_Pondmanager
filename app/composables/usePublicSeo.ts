import type { MaybeRefOrGetter } from 'vue'

interface PublicSeoOptions {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  image?: MaybeRefOrGetter<string>
  imageAlt?: MaybeRefOrGetter<string>
}

const DEFAULT_SOCIAL_IMAGE = '/images/source-web/home-img-0999.jpg'

function absoluteUrl(value: string, siteUrl: string) {
  return new URL(value, `${siteUrl.replace(/\/$/, '')}/`).toString()
}

export function usePublicSeo(options: PublicSeoOptions) {
  const route = useRoute()
  const config = useRuntimeConfig()
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '')

  const title = computed(() => toValue(options.title))
  const description = computed(() => toValue(options.description))
  const canonical = computed(() => absoluteUrl(route.path || '/', siteUrl))
  const image = computed(() => absoluteUrl(toValue(options.image) || DEFAULT_SOCIAL_IMAGE, siteUrl))
  const imageAlt = computed(() => toValue(options.imageAlt) || title.value)

  useSeoMeta({
    title,
    description,
    robots: 'index, follow',
    ogTitle: title,
    ogDescription: description,
    ogType: 'website',
    ogSiteName: config.public.appName,
    ogLocale: 'sk_SK',
    ogUrl: canonical,
    ogImage: image,
    ogImageAlt: imageAlt,
    twitterCard: 'summary_large_image',
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: image,
    twitterImageAlt: imageAlt,
  })

  useHead(() => ({
    link: [
      {
        key: 'canonical',
        rel: 'canonical',
        href: canonical.value,
      },
    ],
  }))
}
