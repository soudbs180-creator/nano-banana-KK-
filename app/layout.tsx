import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'KK Studio - AI Image Workspace',
    description: 'Generate and organize AI images on an infinite canvas',
    icons: {
        icon: '/icon.png',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-CN">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="antialiased">{children}</body>
        </html>
    );
}
