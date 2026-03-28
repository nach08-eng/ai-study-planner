const careerCatalog = [
  {
    title: "Data Analyst",
    keywords: ["data", "analytics", "business", "excel", "sql", "dashboard", "statistics"],
    strengths: ["logic", "curiosity", "communication"],
    requiredSkills: ["SQL", "Excel", "Data Visualization", "Statistics", "Python", "Storytelling"],
    learningWeeks: "8-16 weeks"
  },
  {
    title: "Frontend Developer",
    keywords: ["tech", "design", "ui", "web", "react", "frontend", "product"],
    strengths: ["creativity", "logic", "attention to detail"],
    requiredSkills: ["HTML", "CSS", "JavaScript", "React", "Git", "API Integration"],
    learningWeeks: "10-20 weeks"
  },
  {
    title: "UI/UX Designer",
    keywords: ["design", "creative", "product", "research", "visual", "experience"],
    strengths: ["creativity", "empathy", "communication"],
    requiredSkills: ["Figma", "User Research", "Wireframing", "Prototyping", "Accessibility", "Design Systems"],
    learningWeeks: "8-14 weeks"
  },
  {
    title: "Product Manager",
    keywords: ["business", "strategy", "leadership", "product", "market", "stakeholders"],
    strengths: ["communication", "leadership", "strategy"],
    requiredSkills: ["Roadmapping", "Prioritization", "Analytics", "Stakeholder Management", "Experimentation", "Documentation"],
    learningWeeks: "12-24 weeks"
  },
  {
    title: "Business Analyst",
    keywords: ["business", "operations", "process", "excel", "sql", "reporting"],
    strengths: ["logic", "communication", "organization"],
    requiredSkills: ["SQL", "Excel", "Requirements Gathering", "Process Mapping", "Presentation", "Dashboarding"],
    learningWeeks: "8-18 weeks"
  },
  {
    title: "Digital Marketer",
    keywords: ["marketing", "growth", "social", "brand", "content", "sales"],
    strengths: ["communication", "creativity", "adaptability"],
    requiredSkills: ["Content Strategy", "SEO", "Analytics", "Copywriting", "Campaign Planning", "Paid Ads"],
    learningWeeks: "6-14 weeks"
  },
  {
    title: "AI / ML Engineer",
    keywords: ["ai", "machine learning", "python", "data", "model", "automation"],
    strengths: ["logic", "curiosity", "persistence"],
    requiredSkills: ["Python", "Statistics", "Machine Learning", "Data Structures", "APIs", "Model Evaluation"],
    learningWeeks: "16-32 weeks"
  }
];

const skillRoadmaps = {
  "Data Analyst": {
    beginner: ["Excel formulas", "SQL SELECT queries", "Data cleaning"],
    intermediate: ["Data visualization", "Python pandas", "Dashboard storytelling"],
    advanced: ["A/B testing", "Forecasting", "Business case studies"]
  },
  "Frontend Developer": {
    beginner: ["HTML semantics", "CSS layout", "JavaScript basics"],
    intermediate: ["React components", "API integration", "State management"],
    advanced: ["Performance tuning", "Accessibility", "Product-grade UI architecture"]
  },
  "UI/UX Designer": {
    beginner: ["Figma basics", "Wireframing", "UX principles"],
    intermediate: ["User flows", "Prototyping", "Design critique"],
    advanced: ["Design systems", "Usability testing", "Advanced interaction design"]
  },
  "Product Manager": {
    beginner: ["Problem framing", "User stories", "Feature prioritization"],
    intermediate: ["Roadmaps", "Metrics design", "Experiment planning"],
    advanced: ["Cross-functional leadership", "Go-to-market planning", "Portfolio strategy"]
  },
  "Business Analyst": {
    beginner: ["Excel basics", "Requirements gathering", "Process mapping"],
    intermediate: ["SQL reporting", "Stakeholder interviews", "Dashboarding"],
    advanced: ["Optimization analysis", "Ops improvement", "Executive presentations"]
  },
  "Digital Marketer": {
    beginner: ["Content basics", "SEO fundamentals", "Audience research"],
    intermediate: ["Campaign planning", "Analytics", "Copywriting"],
    advanced: ["Growth experiments", "Marketing automation", "Attribution modeling"]
  },
  "AI / ML Engineer": {
    beginner: ["Python basics", "Math for ML", "Data preprocessing"],
    intermediate: ["Feature engineering", "Model training", "Evaluation"],
    advanced: ["Deployment", "Monitoring", "LLM integration"]
  }
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function tokenize(values) {
  return values
    .flatMap((value) => String(value || "").split(/[,/|]/g))
    .flatMap((part) => part.split(/\s+/g))
    .map((item) => normalize(item))
    .filter(Boolean);
}

function scoreCareer(profile, career) {
  const interests = tokenize(profile.interests || []);
  const strengths = tokenize(profile.strengths || []);
  const skills = tokenize(profile.skills || []);
  const text = `${interests.join(" ")} ${strengths.join(" ")} ${skills.join(" ")}`;

  let score = 0;
  for (const keyword of career.keywords) {
    if (text.includes(keyword)) {
      score += 3;
    }
  }
  for (const strength of career.strengths) {
    if (text.includes(strength)) {
      score += 2;
    }
  }
  for (const required of career.requiredSkills) {
    if (skills.includes(normalize(required))) {
      score += 1;
    }
  }

  return score;
}

function getFallbackCareerSuggestions(profile) {
  return careerCatalog
    .map((career) => ({
      title: career.title,
      reason: `It aligns with your ${profile.interests?.join(", ") || "interests"} and rewards ${career.strengths.join(", ")}.`,
      duration: career.learningWeeks,
      score: scoreCareer(profile, career),
      requiredSkills: career.requiredSkills
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, requiredSkills, ...career }) => career);
}

function getCareerTemplate(title) {
  return careerCatalog.find(
    (career) => normalize(career.title) === normalize(title)
  );
}

function getFallbackSkillGap(userSkills, careerTitle) {
  const template = getCareerTemplate(careerTitle) || careerCatalog[0];
  const normalizedSkills = tokenize(userSkills || []);
  const levels = ["Beginner", "Intermediate", "Advanced"];

  return template.requiredSkills.map((skill, index) => ({
    skill,
    level: levels[Math.min(index, levels.length - 1)],
    priority: index + 1,
    missing: !normalizedSkills.includes(normalize(skill))
  }));
}

function getRoadmapBlocks(careerTitle) {
  const template = skillRoadmaps[careerTitle] || skillRoadmaps["Data Analyst"];
  return [
    ...template.beginner.map((topic) => ({ difficulty: "Beginner", topic })),
    ...template.intermediate.map((topic) => ({ difficulty: "Intermediate", topic })),
    ...template.advanced.map((topic) => ({ difficulty: "Advanced", topic }))
  ];
}

module.exports = {
  careerCatalog,
  getCareerTemplate,
  getFallbackCareerSuggestions,
  getFallbackSkillGap,
  getRoadmapBlocks,
  tokenize
};
