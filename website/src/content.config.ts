import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    author: z.string().default("Mero Udhyog"),
    cover: z.string(),
    tag: z.string().default("Operations"),
    readingTime: z.string().default("5 min"),
  }),
});

export const collections = { blog };
