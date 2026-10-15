import React from 'react';
import Navbar from '@/components/Navbar/Navbar';
import Footer from '@/components/Footer/Footer';
import ParticleBackground from '@/components/Home/ParticleBackground';
import BlogDetailClient from './BlogDetailClient';
import styles from '@/app/page.module.css';

import { blogPosts } from '@/components/Blog/blogData';

export async function generateStaticParams() {
  const params = [];
  blogPosts.forEach(post => {
    params.push({ id: post.id.toString() });
    if (post.slug) {
      params.push({ id: post.slug });
    }
  });
  return params;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const post = blogPosts.find(p => p.id === parseInt(id) || p.slug === id);
  if (!post) {
    return {
      title: "Article Not Found | Sanmora",
      description: "The article you are looking for does not exist."
    };
  }
  const pageTitle = post.seoTitle || post.title;
  const pageDesc = post.metaDescription || post.excerpt || "Read the latest article from Sanmora.";
  const canonicalUrl = `https://sanmora.in/blog/${post.slug || post.id}`;
  const imageUrl = post.image ? (post.image.startsWith("http") ? post.image : `https://sanmora.in${post.image}`) : undefined;

  return {
    title: `${pageTitle} | Sanmora`,
    description: pageDesc,
    keywords: post.keywords || post.tags || [],
    authors: [{ name: post.author || "Sanmora Technology Team" }],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${pageTitle} | Sanmora`,
      description: pageDesc,
      url: canonicalUrl,
      siteName: "Sanmora",
      images: imageUrl ? [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ] : [],
      type: "article",
      publishedTime: post.date,
      authors: [post.author || "Sanmora Technology Team"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${pageTitle} | Sanmora`,
      description: pageDesc,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function BlogDetailPage({ params }) {
  const { id } = await params;

  return (
    <main className={styles.page}>
      <ParticleBackground />
      <div className={styles.ambientGlowPrimary}></div>
      <div className={styles.ambientGlowSecondary}></div>

      <Navbar />
      <BlogDetailClient id={id} />
      <Footer />
    </main>
  );
}
