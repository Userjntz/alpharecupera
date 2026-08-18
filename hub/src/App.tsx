import { BannerCarousel } from './components/BannerCarousel'
import { LinkButton } from './components/LinkButton'
import { ProfileHeader } from './components/ProfileHeader'
import { SocialRow } from './components/SocialRow'
import { hubLinks } from './data/hub'

export default function App() {
  const links = hubLinks()

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-page">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 h-56 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_70%)]"
      />

      <main className="relative max-w-[400px] mx-auto px-5 pt-10 pb-12 flex flex-col gap-7">
        <ProfileHeader />
        <BannerCarousel />

        <section className="flex flex-col gap-2.5">
          {links.map((link, index) => (
            <LinkButton key={link.id} link={link} index={index} />
          ))}
        </section>

        <SocialRow />

        <footer className="pt-1 text-center">
          <p className="text-[11px] font-medium text-white/30">
            © {new Date().getFullYear()} Alpha Recupera
          </p>
        </footer>
      </main>
    </div>
  )
}

