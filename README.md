# Creative Spark Studio

Build a full-stack web app called Creative Factory.

The app is an AI-assisted batch short-form video production tool for TikTok and Instagram Reels.

IMPORTANT:

Build the MVP first. Do not attempt web scraping, social media posting, analytics integrations, or advanced AI video selection yet.

TECH STACK:

- React + TypeScript

- Tailwind CSS

- shadcn/ui

- Supabase/Postgres for database and storage

- Server-side functions for AI API calls

- FFmpeg-based video processing architecture

- Keep AI provider abstraction flexible so OpenAI and Anthropic can be swapped later.

DESIGN:

Create a premium dark SaaS dashboard.

Clean, modern, minimal.

Desktop-first but responsive.

Use subtle borders, cards, tables, progress indicators, and polished empty states.

Do not make it look like a generic AI landing page.

MAIN NAVIGATION:

- Dashboard

- Projects

- Media Library

- Hook Library

- Performance

- Settings

MVP WORKFLOW:

1. DASHBOARD

Show:

- New Project button

- Recent projects

- Active render jobs

- Completed videos

- Hook statistics

2. NEW PROJECT

Allow user to create a project with:

- Project name

- Product name

- Product URL (store but do not scrape yet)

- Target gender

- Target age

- Target location

- Target interests

- Platform: TikTok / Instagram / both

- Content style: UGC, POV, product-focused, storytelling, problem/solution, testimonial

- Number of videos to generate

3. PROJECT PAGE

Show:

- Product information

- Project settings

- Media assets

- Hook generation

- Generated videos

- Render queue

4. MEDIA LIBRARY

Allow uploading MP4/MOV video files.

Store media assets in Supabase Storage.

Each media asset should have:

- id

- project_id

- file_url

- thumbnail_url

- filename

- duration

- width

- height

- category

- tags

- created_at

Allow:

- Upload

- Delete

- Search

- Filter

- Preview

- Tagging

- Categorization

Categories:

Product

UGC

Lifestyle

Close-up

Unboxing

Reaction

Other

5. HOOK LIBRARY

Create a database of hooks.

Each hook needs:

- id

- text

- category

- structure

- emotional_trigger

- audience

- platform

- is_winner

- performance_score

- views

- retention

- shares

- saves

- conversion_rate

- created_at

Create categories:

POV

Curiosity

Story

Problem/Solution

Social Proof

Confession

Discovery

Comparison

Allow users to:

- Add hooks manually

- Edit hooks

- Delete hooks

- Mark hooks as winners

- Search/filter hooks

- View performance

6. AI HOOK GENERATOR

Create a UI where the user selects:

- Product

- Audience

- Platform

- Content style

- Number of hooks

- Hook categories

- Winning hooks to use as inspiration

The AI should generate original hook variants based on the structural patterns of selected winning hooks.

IMPORTANT:

Do not simply copy winning hooks.

Analyze their structure, emotional trigger, and format and generate new variants.

Display generated hooks in selectable cards.

Actions:

- Save

- Edit

- Regenerate

- Delete

- Mark winner

Create a server-side AI service abstraction:

generateHooks()

analyzeHookStructure()

generateHookVariants()

scoreHooks()

Do not expose API keys in frontend code.

7. VIDEO RECIPE

Allow the user to combine:

- Hook

- Media asset

- Duration

- Overlay style

Default video:

- 8 seconds

- 9:16

- 1080x1920

- MP4

Overlay default:

- Black text

- White rectangular background

- Clean bold sans-serif font

- Positioned near the top

- Text should automatically wrap cleanly

- No text outside safe areas

Create a video recipe object containing:

- hook_id

- media_asset_id

- duration

- overlay_text

- overlay_position

- font_size

- background_color

- text_color

8. VIDEO RENDERING

Create a render queue architecture.

Each render job:

- id

- project_id

- recipe_id

- status

- progress

- output_url

- error_message

- created_at

- completed_at

Statuses:

queued

processing

completed

failed

Use FFmpeg on the server/backend for:

- trimming

- cropping

- resizing

- text overlay

- encoding

- output

For the MVP, implement a clean rendering service abstraction even if advanced background processing needs to be completed later.

9. GENERATED VIDEOS

Show generated videos in a grid.

Each card:

- Video preview

- Hook

- Source clip

- Duration

- Status

- Download button

- Delete button

- Mark as winner

10. BATCH GENERATION

Allow user to select:

- Multiple hooks

- Multiple media assets

Generate combinations into render jobs.

Example:

10 hooks × 3 clips = 30 video recipes.

Show:

30 videos queued

X processing

X completed

X failed

Add:

- Download individual video

- Download all completed videos as ZIP

11. PERFORMANCE

Create the database/UI structure for manually entering:

- views

- average watch time

- completion rate

- likes

- comments

- shares

- saves

- clicks

- conversions

Allow videos/hooks to be marked as winners.

12. DATABASE TABLES

Create:

projects

products

media_assets

hooks

hook_variants

video_recipes

render_jobs

generated_videos

performance_metrics

Use proper foreign keys, timestamps, indexes, and row-level security.

13. IMPORTANT PRODUCT PRINCIPLES

The AI should handle creative reasoning:

- hook generation

- hook structure analysis

- hook variants

- hook scoring

The video engine should handle deterministic operations:

- crop

- trim

- resize

- text overlay

- encoding

Do NOT use an AI video-generation model for simple editing.

Build reusable components and services so we can add:

- automatic footage discovery

- product URL extraction

- TikTok/Instagram analytics

- automatic performance learning

- multiple AI providers

- automatic publishing

later without rewriting the MVP.

Start by building the complete UI, database schema, upload flow, hook library, project workflow, and architecture. Make the application functional rather than a static mockup.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/430daa9e-3b01-4252-9ac1-78cb9cc52cbe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
