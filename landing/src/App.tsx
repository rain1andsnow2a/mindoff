import Starfield from './components/Starfield';
import Nav from './components/Nav';
import Hero from './components/Hero';
import DumpSection from './components/DumpSection';
import MemorySection from './components/MemorySection';
import DeskSection from './components/DeskSection';
import TheaterSection from './components/TheaterSection';
import DownloadSection from './components/DownloadSection';
import Footer from './components/Footer';
import { useReveal } from './hooks/useReveal';

export default function App() {
  useReveal();
  return (
    <>
      <Starfield />
      <div className="aura aura-a" />
      <div className="aura aura-b" />
      <div className="aura aura-c" />
      <Nav />
      <main>
        <Hero />
        <DumpSection />
        <MemorySection />
        <DeskSection />
        <TheaterSection />
        <DownloadSection />
      </main>
      <Footer />
    </>
  );
}
