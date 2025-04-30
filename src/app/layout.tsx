import './globals.css'; // Optioneel: als je een globale CSS file hebt
import { Inter } from 'next/font/google'; // Optioneel: als je Google Fonts gebruikt

// Optioneel: Configureer een font, zoals Inter
const inter = Inter({ subsets: ['latin'] });

// Optioneel: Exporteer metadata
export const metadata = {
  title: 'Hailo Finance Mentor', // Pas dit aan
  description: 'Voice-controlled AI mentor for Financial Management', // Pas dit aan
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en"> {/* Of 'nl' voor Nederlands */}
      {/* De head tags zoals title, meta description etc. worden afgehandeld via metadata export hierboven */}
      <body>
        {children} {/* Dit is waar de inhoud van je page.tsx wordt geladen */}
      </body>
    </html>
  );
}