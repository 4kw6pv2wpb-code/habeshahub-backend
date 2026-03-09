/**
 * Database seed script.
 * Populates the database with realistic sample data for development.
 *
 * Usage: npx prisma db seed   (or)   npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;

async function main() {
  console.log('🌱 Seeding HabeshaHub database...\n');

  const db = prisma as any;

  // ── Clean existing data ──────────────────
  // Phase 2+ models (reverse dependency order)
  await db.streamGift.deleteMany();
  await db.liveStream.deleteMany();
  await db.equbPayout.deleteMany();
  await db.equbMembership.deleteMany();
  await db.equbGroup.deleteMany();
  await db.videoLike.deleteMany();
  await db.videoComment.deleteMany();
  await db.video.deleteMany();
  await db.creatorProfile.deleteMany();
  await db.housingInquiry.deleteMany();
  await db.savedListing.deleteMany();
  await db.housingListing.deleteMany();
  // Phase 1 models
  await prisma.notification.deleteMany();
  await prisma.match.deleteMany();
  await prisma.swipe.deleteMany();
  await prisma.datingProfile.deleteMany();
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.application.deleteMany();
  await prisma.story.deleteMany();
  await prisma.remittance.deleteMany();
  await prisma.event.deleteMany();
  await prisma.job.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  console.log('  ✓ Cleaned existing data');

  // ── Create Users ─────────────────────────
  const passwordHash = await bcrypt.hash('password123', SALT_ROUNDS);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'selam@habeshahub.com',
        name: 'Selam Tadesse',
        bio: 'Software engineer based in Seattle. Passionate about connecting the Habesha diaspora through technology.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=selam',
        city: 'Seattle',
        country: 'US',
        passwordHash,
        languages: ['EN', 'AM'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'yonas@habeshahub.com',
        name: 'Yonas Berhe',
        bio: 'Entrepreneur and community organizer in the DC area. Building bridges between diaspora and homeland.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yonas',
        city: 'Washington DC',
        country: 'US',
        passwordHash,
        languages: ['EN', 'TI'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'meron@habeshahub.com',
        name: 'Meron Hailu',
        bio: 'UX Designer and photographer. Capturing the beauty of our culture through modern lens.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=meron',
        city: 'Los Angeles',
        country: 'US',
        passwordHash,
        languages: ['EN', 'AM', 'TI'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'dawit@habeshahub.com',
        name: 'Dawit Gebremedhin',
        bio: 'Finance professional. Advocate for easier remittance corridors to East Africa.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dawit',
        city: 'Toronto',
        country: 'CA',
        passwordHash,
        languages: ['EN', 'TI'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'hanan@habeshahub.com',
        name: 'Hanan Abdi',
        bio: 'Medical student and community health advocate. Interested in telemedicine for diaspora families.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hanan',
        city: 'Minneapolis',
        country: 'US',
        passwordHash,
        languages: ['EN', 'SO'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'kidist@habeshahub.com',
        name: 'Kidist Alemayehu',
        bio: 'Chef and food blogger sharing fusion recipes that blend Ethiopian flavors with modern cuisine.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=kidist',
        city: 'London',
        country: 'UK',
        passwordHash,
        languages: ['EN', 'AM'],
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'nahom@habeshahub.com',
        name: 'Nahom Tekle',
        bio: 'Immigration attorney helping diaspora navigate the US immigration system.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=nahom',
        city: 'Atlanta',
        country: 'US',
        passwordHash,
        languages: ['EN', 'TI', 'AM'],
        isVerified: true,
        role: 'MODERATOR',
      },
    }),
    prisma.user.create({
      data: {
        email: 'admin@habeshahub.com',
        name: 'HabeshaHub Admin',
        bio: 'Official HabeshaHub administrator account.',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
        city: 'Seattle',
        country: 'US',
        passwordHash,
        languages: ['EN', 'AM', 'TI'],
        isVerified: true,
        role: 'ADMIN',
      },
    }),
  ]);

  console.log(`  ✓ Created ${users.length} users`);

  // ── Create Posts ──────────────────────────
  const posts = await Promise.all([
    prisma.post.create({
      data: {
        authorId: users[0].id,
        content: 'Just launched a new feature for HabeshaHub that lets you send remittances directly to family in Addis! 🇪🇹💸 Check it out and let me know what you think.',
        likesCount: 45,
        commentsCount: 12,
      },
    }),
    prisma.post.create({
      data: {
        authorId: users[1].id,
        content: 'The DC Habesha community meetup this weekend was amazing! Over 200 people came out. Love seeing our community grow. #HabeshaInDC #Diaspora',
        likesCount: 87,
        commentsCount: 23,
      },
    }),
    prisma.post.create({
      data: {
        authorId: users[2].id,
        content: 'New photo series: "Between Two Worlds" — capturing the beauty of growing up as first-gen Habesha in America. Link in bio 📸',
        mediaUrl: 'https://images.unsplash.com/photo-1516589091380-5d8e87df6999',
        mediaType: 'image',
        likesCount: 134,
        commentsCount: 31,
      },
    }),
    prisma.post.create({
      data: {
        authorId: users[3].id,
        content: 'Did you know? Sending money to Ethiopia costs an average of 7% in fees. We can do better. Working on partnerships to bring that below 3%. 💰',
        likesCount: 56,
        commentsCount: 18,
      },
    }),
    prisma.post.create({
      data: {
        authorId: users[4].id,
        content: 'Free health screening for the Somali community in Minneapolis this Saturday! Bring your family. Habesha healthcare professionals volunteering. 🏥',
        likesCount: 92,
        commentsCount: 15,
      },
    }),
    prisma.post.create({
      data: {
        authorId: users[5].id,
        content: 'New recipe alert: Injera Pizza — yes, you read that right! Ethiopian injera as the base, topped with berbere sauce and mozzarella. Trust the process 😋🍕',
        mediaUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
        mediaType: 'image',
        likesCount: 201,
        commentsCount: 67,
      },
    }),
  ]);

  console.log(`  ✓ Created ${posts.length} posts`);

  // ── Create Jobs ───────────────────────────
  const jobs = await Promise.all([
    prisma.job.create({
      data: {
        posterId: users[0].id,
        title: 'Senior Full-Stack Engineer',
        description: 'Join our team building the HabeshaHub platform. Looking for a passionate engineer with experience in React Native, Node.js, and PostgreSQL.',
        skills: ['TypeScript', 'React Native', 'Node.js', 'PostgreSQL', 'AWS'],
        payMin: 120000,
        payMax: 180000,
        city: 'Seattle',
        country: 'US',
        remote: true,
        jobType: 'FULL_TIME',
      },
    }),
    prisma.job.create({
      data: {
        posterId: users[1].id,
        title: 'Community Manager — East Coast',
        description: 'Manage and grow the HabeshaHub community across the East Coast. Organize events, manage social media, and build partnerships.',
        skills: ['Community Management', 'Social Media', 'Event Planning', 'Marketing'],
        payMin: 55000,
        payMax: 75000,
        city: 'Washington DC',
        country: 'US',
        remote: false,
        jobType: 'FULL_TIME',
      },
    }),
    prisma.job.create({
      data: {
        posterId: users[3].id,
        title: 'Fintech Product Manager',
        description: 'Drive the product roadmap for our remittance and financial services features. Experience with cross-border payments a plus.',
        skills: ['Product Management', 'Fintech', 'Agile', 'Cross-border Payments'],
        payMin: 100000,
        payMax: 150000,
        city: 'Toronto',
        country: 'CA',
        remote: true,
        jobType: 'FULL_TIME',
      },
    }),
    prisma.job.create({
      data: {
        posterId: users[2].id,
        title: 'UX/UI Designer — Contract',
        description: 'Design beautiful, culturally-aware interfaces for the Habesha diaspora. Portfolio required.',
        skills: ['Figma', 'UI Design', 'UX Research', 'Design Systems', 'Prototyping'],
        payMin: 80,
        payMax: 120,
        city: 'Los Angeles',
        country: 'US',
        remote: true,
        jobType: 'CONTRACT',
      },
    }),
    prisma.job.create({
      data: {
        posterId: users[5].id,
        title: 'Content Creator — Food & Culture',
        description: 'Create engaging content about Habesha food and culture for our platform. Must be passionate about East African cuisine.',
        skills: ['Content Creation', 'Photography', 'Video Editing', 'Food Styling'],
        payMin: 35000,
        payMax: 55000,
        city: 'London',
        country: 'UK',
        remote: false,
        jobType: 'PART_TIME',
      },
    }),
  ]);

  console.log(`  ✓ Created ${jobs.length} jobs`);

  // ── Create Stories ────────────────────────
  const now = new Date();
  const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.story.create({
      data: {
        authorId: users[0].id,
        mediaUrl: 'https://images.unsplash.com/photo-1489749798305-4fea3ae63d43',
        mediaType: 'image',
        caption: 'Beautiful day in Seattle ☀️',
        expiresAt: twentyFourHoursLater,
      },
    }),
    prisma.story.create({
      data: {
        authorId: users[2].id,
        mediaUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
        mediaType: 'image',
        caption: 'Behind the scenes of my latest shoot',
        expiresAt: twentyFourHoursLater,
      },
    }),
    prisma.story.create({
      data: {
        authorId: users[5].id,
        mediaUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836',
        mediaType: 'image',
        caption: 'New recipe coming tomorrow! 🍲',
        expiresAt: twentyFourHoursLater,
      },
    }),
  ]);

  console.log('  ✓ Created 3 stories');

  // ── Create Events ─────────────────────────
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.event.create({
      data: {
        organizerId: users[1].id,
        title: 'Habesha Networking Night — DC',
        description: 'Monthly networking event for Habesha professionals in the DC metro area. Food, drinks, and great connections.',
        location: 'Ethiopian Embassy Cultural Center',
        city: 'Washington DC',
        country: 'US',
        date: nextWeek,
        coverUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865',
        maxAttendees: 100,
      },
    }),
    prisma.event.create({
      data: {
        organizerId: users[0].id,
        title: 'Tech Habesha Meetup — Virtual',
        description: 'Monthly virtual meetup for Habesha tech professionals. This month: Building for the diaspora market.',
        isOnline: true,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        date: nextWeek,
        maxAttendees: 500,
      },
    }),
    prisma.event.create({
      data: {
        organizerId: users[5].id,
        title: 'Injera Making Workshop — London',
        description: 'Learn to make perfect injera from scratch. All ingredients provided. Limited spots!',
        location: 'Kidist Kitchen Studio',
        city: 'London',
        country: 'UK',
        date: nextMonth,
        maxAttendees: 20,
      },
    }),
  ]);

  console.log('  ✓ Created 3 events');

  // ── Create Message Threads ────────────────
  const thread1 = await prisma.thread.create({
    data: {
      participants: { connect: [{ id: users[0].id }, { id: users[1].id }] },
      lastMessageAt: now,
    },
  });

  await prisma.message.createMany({
    data: [
      { threadId: thread1.id, senderId: users[0].id, text: 'Hey Yonas! How was the DC meetup?' },
      { threadId: thread1.id, senderId: users[1].id, text: 'It was incredible! Over 200 people showed up. We should do a joint Seattle-DC event.' },
      { threadId: thread1.id, senderId: users[0].id, text: 'Love that idea. Let me check some venues here and we can plan it out.' },
    ],
  });

  console.log('  ✓ Created 1 message thread with 3 messages');

  // ── Create Remittances ────────────────────
  await prisma.remittance.createMany({
    data: [
      {
        userId: users[0].id,
        amount: 500,
        currency: 'USD',
        corridor: 'US-ET',
        feeAmount: 7.50,
        exchangeRate: 56.80,
        recipientAmount: 27964,
        recipientCurrency: 'ETB',
        recipientName: 'Abeba Tadesse',
        recipientPhone: '+251911234567',
        status: 'PAID',
        paidAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        userId: users[3].id,
        amount: 1000,
        currency: 'CAD',
        corridor: 'CA-ER',
        feeAmount: 12.00,
        exchangeRate: 11.20,
        recipientAmount: 11064,
        recipientCurrency: 'ERN',
        recipientName: 'Tekle Gebremedhin',
        recipientPhone: '+2917123456',
        status: 'IN_FLIGHT',
      },
    ],
  });

  console.log('  ✓ Created 2 remittances');

  // ── Create Comments & Likes ───────────────
  await Promise.all([
    prisma.comment.create({
      data: { postId: posts[0].id, authorId: users[1].id, content: 'This is amazing! The diaspora needs this so badly. 🙌' },
    }),
    prisma.comment.create({
      data: { postId: posts[0].id, authorId: users[3].id, content: 'What corridors do you support? Would love to see US-ER!' },
    }),
    prisma.comment.create({
      data: { postId: posts[5].id, authorId: users[0].id, content: 'Injera pizza?! 😂 Actually looks amazing though' },
    }),
    prisma.like.create({ data: { postId: posts[0].id, userId: users[1].id } }),
    prisma.like.create({ data: { postId: posts[0].id, userId: users[2].id } }),
    prisma.like.create({ data: { postId: posts[5].id, userId: users[0].id } }),
    prisma.like.create({ data: { postId: posts[5].id, userId: users[1].id } }),
    prisma.like.create({ data: { postId: posts[5].id, userId: users[4].id } }),
  ]);

  console.log('  ✓ Created 3 comments and 5 likes');

  // ── Create Dating Profiles ────────────────
  await Promise.all([
    prisma.datingProfile.create({
      data: {
        userId: users[0].id,
        headline: 'Tech nerd who loves Ethiopian coffee ceremonies',
        aboutMe: 'First-gen Habesha in Seattle. When I am not coding, you will find me at a coffee shop or hiking in the PNW.',
        interests: ['Technology', 'Hiking', 'Coffee', 'Ethiopian Music', 'Travel'],
        goal: 'SERIOUS',
        birthDate: new Date('1994-06-15'),
        height: 178,
        education: 'Computer Science, University of Washington',
        occupation: 'Software Engineer',
        photoUrls: ['https://api.dicebear.com/7.x/avataaars/svg?seed=selam-1', 'https://api.dicebear.com/7.x/avataaars/svg?seed=selam-2'],
      },
    }),
    prisma.datingProfile.create({
      data: {
        userId: users[2].id,
        headline: 'Creative soul with a camera and a dream',
        aboutMe: 'Born in Asmara, raised in LA. I see the world through my lens and live for capturing authentic moments.',
        interests: ['Photography', 'Art', 'Fashion', 'Travel', 'Film'],
        goal: 'SERIOUS',
        birthDate: new Date('1996-03-22'),
        height: 165,
        education: 'Fine Arts, UCLA',
        occupation: 'UX Designer & Photographer',
        photoUrls: ['https://api.dicebear.com/7.x/avataaars/svg?seed=meron-1'],
      },
    }),
    prisma.datingProfile.create({
      data: {
        userId: users[4].id,
        headline: 'Future doctor who loves community health',
        aboutMe: 'Somali-American med student in Minneapolis. Passionate about healthcare access for immigrant communities.',
        interests: ['Medicine', 'Community Health', 'Running', 'Reading', 'Cooking'],
        goal: 'CASUAL',
        birthDate: new Date('1997-11-08'),
        height: 170,
        education: 'Medicine, University of Minnesota',
        occupation: 'Medical Student',
        photoUrls: ['https://api.dicebear.com/7.x/avataaars/svg?seed=hanan-1'],
      },
    }),
  ]);

  console.log('  ✓ Created 3 dating profiles');

  // ── Create Notifications ──────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: users[0].id,
        type: 'like',
        title: 'New Like',
        body: 'Yonas Berhe liked your post about remittances',
        data: { postId: posts[0].id },
      },
      {
        userId: users[0].id,
        type: 'comment',
        title: 'New Comment',
        body: 'Dawit Gebremedhin commented on your post',
        data: { postId: posts[0].id },
      },
      {
        userId: users[5].id,
        type: 'like',
        title: 'New Like',
        body: 'Selam Tadesse liked your injera pizza post',
        data: { postId: posts[5].id },
      },
      {
        userId: users[1].id,
        type: 'event',
        title: 'Event Reminder',
        body: 'Your "Habesha Networking Night" event is coming up next week!',
        data: { type: 'event_reminder' },
      },
      {
        userId: users[0].id,
        type: 'system',
        title: 'Welcome to HabeshaHub!',
        body: 'Complete your profile to connect with the Habesha diaspora community.',
        isRead: true,
      },
    ],
  });

  console.log('  ✓ Created 5 notifications');

  // ── Create Job Applications ───────────────
  await prisma.application.create({
    data: {
      jobId: jobs[0].id,
      applicantId: users[2].id,
      coverLetter: 'As a UX designer with deep understanding of the Habesha community, I would love to contribute to HabeshaHub as a full-stack engineer. I have been learning TypeScript and React Native.',
      matchScore: 0.72,
      status: 'reviewed',
    },
  });

  console.log('  ✓ Created 1 job application');

  // ── Create Housing Listings ───────────────
  const housingListings = await Promise.all([
    db.housingListing.create({
      data: {
        posterId: users[0].id,
        title: '2BR Apartment in Capitol Hill — Roommate Wanted',
        description: 'Spacious 2-bedroom apartment in Capitol Hill, Seattle. Looking for a Habesha roommate to share the space. Great natural light, modern kitchen, in-unit laundry. Close to light rail.',
        listingType: 'APARTMENT',
        rent: 1400,
        deposit: 1400,
        city: 'Seattle',
        neighborhood: 'Capitol Hill',
        bedrooms: 2,
        bathrooms: 1,
        furnishing: 'PARTIALLY_FURNISHED',
        leaseType: 'LONG_TERM',
        availableDate: nextMonth,
        photoUrls: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
        amenities: ['wifi', 'laundry', 'parking'],
        utilitiesIncluded: false,
        petsAllowed: false,
        preferredLanguages: ['AM', 'EN'],
      },
    }),
    db.housingListing.create({
      data: {
        posterId: users[1].id,
        title: 'Cozy Studio in Adams Morgan — Entire Place',
        description: 'Fully furnished studio in the heart of Adams Morgan, DC. Perfect for a young professional. Walking distance to Ethiopian restaurants and coffee shops. Available immediately.',
        listingType: 'APARTMENT',
        rent: 1100,
        deposit: 1100,
        city: 'Washington DC',
        neighborhood: 'Adams Morgan',
        bedrooms: 1,
        bathrooms: 1,
        furnishing: 'FURNISHED',
        leaseType: 'FLEXIBLE',
        availableDate: now,
        photoUrls: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267'],
        amenities: ['wifi', 'gym', 'doorman'],
        utilitiesIncluded: true,
        petsAllowed: false,
        preferredLanguages: ['EN', 'AM'],
      },
    }),
    db.housingListing.create({
      data: {
        posterId: users[4].id,
        title: 'Room in Habesha Household — Minneapolis',
        description: 'Private room in a warm Habesha household in South Minneapolis. Share home with 3 other Ethiopian and Eritrean professionals. Home-cooked meals often shared. Very welcoming community.',
        listingType: 'ROOM',
        rent: 600,
        deposit: 600,
        city: 'Minneapolis',
        neighborhood: 'South Minneapolis',
        bedrooms: 1,
        bathrooms: 1,
        furnishing: 'FURNISHED',
        leaseType: 'MONTH_TO_MONTH',
        availableDate: nextMonth,
        photoUrls: ['https://images.unsplash.com/photo-1540518614846-7eded433c457'],
        amenities: ['wifi', 'parking', 'laundry'],
        utilitiesIncluded: true,
        petsAllowed: false,
        smokingAllowed: false,
        preferredLanguages: ['AM', 'TI', 'EN'],
      },
    }),
    db.housingListing.create({
      data: {
        posterId: users[6].id,
        title: '3BR House in Decatur — 2 Rooms Available',
        description: 'Beautiful 3-bedroom house in Decatur, Atlanta. Two rooms available for rent. Large backyard, quiet neighborhood. 20 minutes from Downtown Atlanta. Ideal for working professionals.',
        listingType: 'HOUSE',
        rent: 1800,
        deposit: 1800,
        city: 'Atlanta',
        neighborhood: 'Decatur',
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1400,
        furnishing: 'UNFURNISHED',
        leaseType: 'LONG_TERM',
        availableDate: nextMonth,
        photoUrls: ['https://images.unsplash.com/photo-1570129477492-45c003edd2be'],
        amenities: ['parking', 'laundry', 'backyard'],
        utilitiesIncluded: false,
        petsAllowed: true,
        preferredLanguages: ['EN', 'AM'],
      },
    }),
  ]);

  console.log(`  ✓ Created ${housingListings.length} housing listings`);

  // ── Create Videos ─────────────────────────
  const videos = await Promise.all([
    db.video.create({
      data: {
        authorId: users[5].id, // Kidist
        title: 'How to Make Perfect Injera',
        description: 'Step-by-step guide to making authentic Ethiopian injera at home. Learn the secrets to getting that perfect sour flavor and spongy texture. All ingredients available at your local Ethiopian grocery.',
        originalUrl: 'https://storage.habeshahub.com/videos/injera-tutorial.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1567364255548-30f7a9c8cf69',
        duration: 842,
        status: 'READY',
        likesCount: 1240,
        commentsCount: 87,
        viewCount: 15600,
        hashtags: ['injera', 'ethiopianfood', 'cooking', 'habesha'],
        language: 'EN',
      },
    }),
    db.video.create({
      data: {
        authorId: users[6].id, // Nahom
        title: 'Habesha Comedy: When Mom Calls',
        description: 'POV: Your Habesha mom calls at the worst possible time. A comedy sketch that every diaspora kid will relate to. 😂',
        originalUrl: 'https://storage.habeshahub.com/videos/habesha-comedy-mom.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d',
        duration: 127,
        status: 'READY',
        likesCount: 3420,
        commentsCount: 215,
        viewCount: 48900,
        hashtags: ['habeshahcomedy', 'diaspora', 'funny', 'ethiopian'],
        language: 'EN',
      },
    }),
    db.video.create({
      data: {
        authorId: users[0].id, // Selam
        title: 'Ethiopian Coffee Ceremony at Home',
        description: 'Walk through a full traditional Ethiopian coffee ceremony from roasting the beans to the third cup (baraka). A ritual of connection, culture, and community you can bring into your home anywhere in the world.',
        originalUrl: 'https://storage.habeshahub.com/videos/coffee-ceremony.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085',
        duration: 1260,
        status: 'READY',
        likesCount: 2100,
        commentsCount: 134,
        viewCount: 32700,
        hashtags: ['coffeecremony', 'ethiopian', 'culture', 'habesha', 'bunacoffee'],
        language: 'EN',
      },
    }),
  ]);

  console.log(`  ✓ Created ${videos.length} videos`);

  // ── Create Creator Profiles ───────────────
  const creatorProfiles = await Promise.all([
    db.creatorProfile.create({
      data: {
        userId: users[5].id, // Kidist
        displayName: 'Kidist Cooks',
        bio: 'Sharing the flavors of Ethiopia and Eritrea with the world. Recipes, tutorials, and the stories behind every dish.',
        category: 'food',
        isMonetized: true,
        subscriberCount: 12400,
        totalRevenue: 3200,
        monthlyRevenue: 480,
        tipEnabled: true,
        subscriptionPrice: 4.99,
        badgeLevel: 'silver',
        verifiedAt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      },
    }),
    db.creatorProfile.create({
      data: {
        userId: users[2].id, // Meron
        displayName: 'Meron Captures',
        bio: 'Visual storyteller documenting the Habesha diaspora experience through photography and art.',
        category: 'art',
        isMonetized: false,
        subscriberCount: 3800,
        totalRevenue: 0,
        monthlyRevenue: 0,
        tipEnabled: true,
        badgeLevel: 'bronze',
      },
    }),
  ]);

  console.log(`  ✓ Created ${creatorProfiles.length} creator profiles`);

  // ── Create Equb Groups ────────────────────
  const equbGroups = await Promise.all([
    db.equbGroup.create({
      data: {
        organizerId: users[0].id, // Selam
        name: 'Seattle Habesha Equb',
        description: 'Monthly rotating savings circle for Habesha community members in Seattle. Safe, trusted, and community-run.',
        contributionAmount: 200,
        currency: 'USD',
        cycleFrequency: 'monthly',
        maxMembers: 8,
        currentCycle: 2,
        totalCycles: 8,
        status: 'ACTIVE',
        startDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
        nextPayoutDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
    }),
    db.equbGroup.create({
      data: {
        organizerId: users[3].id, // Dawit
        name: 'Tech Professionals Equb',
        description: 'High-contribution equb for Habesha tech and finance professionals. $500/month, 6 members, 6-month cycle. Vetted members only.',
        contributionAmount: 500,
        currency: 'USD',
        cycleFrequency: 'monthly',
        maxMembers: 6,
        currentCycle: 1,
        totalCycles: 6,
        status: 'ACTIVE',
        startDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        nextPayoutDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  console.log(`  ✓ Created ${equbGroups.length} equb groups`);

  // ── Create Live Streams ───────────────────
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const liveStreams = await Promise.all([
    db.liveStream.create({
      data: {
        hostId: users[1].id, // Yonas
        title: 'Habesha Music Night Live',
        description: 'Join us for a live evening of Habesha music, culture talk, and community connection. Special guest performers from the DC area. Bring your requests!',
        thumbnailUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f',
        streamKey: 'habeshahub-stream-musicnight-2026',
        status: 'SCHEDULED',
        scheduledAt: twoWeeks,
      },
    }),
  ]);

  console.log(`  ✓ Created ${liveStreams.length} live stream`);

  // ── Summary ───────────────────────────────
  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────────');
  console.log(`  Users:             ${users.length}`);
  console.log(`  Posts:             ${posts.length}`);
  console.log(`  Jobs:              ${jobs.length}`);
  console.log('  Stories:           3');
  console.log('  Events:            3');
  console.log('  Threads:           1 (3 messages)');
  console.log('  Remittances:       2');
  console.log('  Dating Profiles:   3');
  console.log('  Notifications:     5');
  console.log('  Comments:          3');
  console.log('  Likes:             5');
  console.log('  Applications:      1');
  console.log(`  Housing Listings:  ${housingListings.length}`);
  console.log(`  Videos:            ${videos.length}`);
  console.log(`  Creator Profiles:  ${creatorProfiles.length}`);
  console.log(`  Equb Groups:       ${equbGroups.length}`);
  console.log(`  Live Streams:      ${liveStreams.length}`);
  console.log('─────────────────────────────────────');
  console.log('\n  Login with: email=selam@habeshahub.com password=password123\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
