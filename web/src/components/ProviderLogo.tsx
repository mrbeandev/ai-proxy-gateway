import { cn } from '@/lib/utils'
import { providerIcon, isMonochromeProvider } from '@/lib/utils'

/**
 * Renders a provider logo.
 *
 * Brand-coloured marks (Claude, Gemini, DeepSeek, Cloudflare) are drawn as
 * plain <img> so they keep their official colours.
 *
 * Monochrome marks (OpenAI) have no colour of their own, so they are painted
 * with a CSS mask and `bg-current` — they inherit the surrounding text colour
 * and therefore flip automatically between light and dark themes.
 */
export function ProviderLogo({
  provider,
  className,
}: {
  provider: string
  className?: string
}) {
  const icon = providerIcon(provider)

  if (!icon) {
    return (
      <span
        className={cn('inline-block rounded-full bg-current opacity-40', className)}
        aria-hidden
      />
    )
  }

  if (isMonochromeProvider(provider)) {
    return (
      <span
        role="img"
        aria-label={provider}
        className={cn('inline-block shrink-0 bg-current', className)}
        style={{
          maskImage: `url(${icon})`,
          WebkitMaskImage: `url(${icon})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    )
  }

  return <img src={icon} alt={provider} className={cn('shrink-0 object-contain', className)} />
}

export default ProviderLogo
