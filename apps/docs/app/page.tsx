import { CodeExamplesSection } from '@/components/landing/code-examples-section'
import { CtaSection } from '@/components/landing/cta-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { Footer } from '@/components/landing/footer'
import { HeroSection } from '@/components/landing/hero-section'
import { PrimitivesSection } from '@/components/landing/primitives-section'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 font-body">
      <HeroSection />
      <PrimitivesSection />
      <FeaturesSection />
      <CodeExamplesSection />
      <CtaSection />
      <Footer />
    </div>
  )
}
