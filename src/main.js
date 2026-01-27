import './style.css'
import Lenis from 'lenis'

// Initialize Lenis for smooth, snappy scrolling
const lenis = new Lenis({
  duration: 1.2,           // Scroll duration (slower = smoother)
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential ease-out for snappy feel
  orientation: 'vertical',
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 2,
})

// Animation frame loop for Lenis
function raf(time) {
  lenis.raf(time)
  requestAnimationFrame(raf)
}
requestAnimationFrame(raf)

// Mobile menu toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn')
const mobileMenu = document.getElementById('mobile-menu')
const mobileMenuClose = document.getElementById('mobile-menu-close')
const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link')

if (mobileMenuBtn && mobileMenu) {
  mobileMenuBtn.addEventListener('click', () => {
    mobileMenu.classList.add('open')
    document.body.style.overflow = 'hidden'
  })

  mobileMenuClose?.addEventListener('click', () => {
    mobileMenu.classList.remove('open')
    document.body.style.overflow = ''
  })

  mobileMenuLinks.forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open')
      document.body.style.overflow = ''
    })
  })
}

// Mobile features submenu toggle
const mobileFeaturesToggle = document.getElementById('mobile-features-toggle')
const mobileFeaturesSection = mobileFeaturesToggle?.closest('.mobile-features-section')

if (mobileFeaturesToggle && mobileFeaturesSection) {
  mobileFeaturesToggle.addEventListener('click', () => {
    mobileFeaturesSection.classList.toggle('open')
  })
}

// FAQ Accordion
const faqItems = document.querySelectorAll('.faq-item')

faqItems.forEach(item => {
  const question = item.querySelector('.faq-question')

  question?.addEventListener('click', () => {
    const isOpen = item.classList.contains('open')

    // Close all other items and update their aria-expanded
    faqItems.forEach(otherItem => {
      if (otherItem !== item) {
        otherItem.classList.remove('open')
        otherItem.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false')
      }
    })

    // Toggle current item
    item.classList.toggle('open', !isOpen)
    question.setAttribute('aria-expanded', !isOpen ? 'true' : 'false')
  })
})

// Smooth scroll for anchor links using Lenis
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href')
    if (href === '#') return

    const target = document.querySelector(href)
    if (target) {
      e.preventDefault()
      lenis.scrollTo(target, {
        offset: -100, // Account for fixed header
        duration: 1.2,
      })

      // Close mobile menu if open
      if (mobileMenu?.classList.contains('open')) {
        mobileMenu.classList.remove('open')
        document.body.style.overflow = ''
      }
    }
  })
})

// Handle dropdown item clicks (for desktop dropdown)
document.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', function (e) {
    const href = this.getAttribute('href')
    if (href && href.startsWith('#')) {
      e.preventDefault()
      lenis.scrollTo(href, {
        offset: -100,
        duration: 1.2,
      })
    }
  })
})

// Header scroll effect with shrink
const header = document.getElementById('header')
const heroPhone = document.getElementById('hero-phone')
let lastScroll = 0
let ticking = false

window.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const currentScroll = window.pageYOffset

      // Header effects
      if (currentScroll > 50) {
        header?.classList.add('shadow-subtle', 'border-gray-200/60', 'header-shrink')
        header?.classList.remove('border-transparent')
      } else {
        header?.classList.remove('shadow-subtle', 'border-gray-200/60', 'header-shrink')
        header?.classList.add('border-transparent')
      }

      // Parallax effect on hero phone (subtle float up)
      if (heroPhone && currentScroll < 800) {
        const translateY = currentScroll * -0.08
        heroPhone.style.transform = `translateY(${translateY}px)`
      }

      lastScroll = currentScroll
      ticking = false
    })
    ticking = true
  }
})

// Intersection Observer for fade-in animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('opacity-100', 'translate-y-0')
      entry.target.classList.remove('opacity-0', 'translate-y-8')
    }
  })
}, observerOptions)

// Observe all animated elements
document.querySelectorAll('.animate-on-scroll').forEach(el => {
  el.classList.add('opacity-0', 'translate-y-8', 'transition-all', 'duration-700', 'ease-out')
  observer.observe(el)
})
