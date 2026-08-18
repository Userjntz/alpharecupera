import { PROFILE } from '../data/hub'

export function ProfileHeader() {
  return (
    <header className="fade-up text-center">
      <img
        src="/logo-white.png"
        alt={PROFILE.name}
        className="h-[70px] sm:h-[78px] w-auto mx-auto object-contain"
      />
      <p className="mt-4 text-sm text-white/50 font-medium leading-relaxed">
        {PROFILE.bio}
      </p>
    </header>
  )
}
