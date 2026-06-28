import { chromium, firefox } from "playwright";

const funct = async () => {
  const browser = await firefox.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto("https://www.naukrigulf.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log(await page.title());
  } finally {
    await browser.close();
  }
};

void funct();
