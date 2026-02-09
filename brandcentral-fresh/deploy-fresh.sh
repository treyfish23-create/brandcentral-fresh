#!/bin/bash

echo "🚀 Brand Central - Fresh Deployment Script"
echo "=========================================="
echo ""
echo "✨ This uses completely fresh, clean files optimized for deployment!"
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the brandcentral-fresh directory"
    echo "   Make sure both 'backend' and 'frontend' folders exist"
    exit 1
fi

echo "🔍 Verifying file structure..."

# Check critical files
FILES=(
    "backend/package.json"
    "backend/server.js"
    "frontend/package.json" 
    "frontend/src/App.js"
    "frontend/public/index.html"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

echo ""
echo "🎯 Deployment Options:"
echo ""
echo "1. 🚂 Railway (Recommended)"
echo "   • Most reliable for full-stack apps"
echo "   • Includes PostgreSQL database"
echo "   • Free tier available"
echo ""
echo "2. 🌐 Render (Alternative)" 
echo "   • Often more reliable than Railway"
echo "   • Good error messages"
echo "   • Easy setup process"
echo ""
echo "3. ⚡ Vercel + Supabase (Advanced)"
echo "   • Frontend on Vercel"
echo "   • Database on Supabase"
echo "   • Excellent performance"
echo ""

echo "📋 Railway Deployment Steps:"
echo ""
echo "1. Upload to GitHub:"
echo "   • Go to github.com"
echo "   • Create repository 'brandcentral-fresh'"
echo "   • Upload this entire folder"
echo ""
echo "2. Deploy Backend:"
echo "   • Go to railway.app"
echo "   • New Project → Deploy from GitHub"
echo "   • Select your repo"
echo "   • Root Directory: backend"
echo "   • Build Command: npm install"
echo "   • Start Command: npm start"
echo ""
echo "3. Add Database:"
echo "   • In Railway dashboard: + Add Service"
echo "   • Select PostgreSQL"
echo "   • Railway auto-connects it!"
echo ""
echo "4. Set Environment Variables:"
echo "   • Backend service → Variables"
echo "   • NODE_ENV = production"
echo "   • JWT_SECRET = (generate random)"
echo "   • FRONTEND_URL = (your frontend URL)"
echo ""
echo "5. Deploy Frontend:"
echo "   • + Add Service → Web Service"
echo "   • Same GitHub repo"
echo "   • Root Directory: frontend"  
echo "   • Build: npm install && npm run build"
echo "   • Start: npx serve -s build -l \$PORT"
echo "   • Environment: REACT_APP_API_URL = (backend URL)/api"
echo ""

echo "🎉 What You'll Get:"
echo ""
echo "✅ Live website with real database"
echo "✅ User registration and authentication" 
echo "✅ Retailer and brand dashboards"
echo "✅ Professional B2B interface"
echo "✅ Scalable to thousands of users"
echo "✅ Production-ready security"
echo ""

echo "📞 Need Help?"
echo ""
echo "• Railway docs: docs.railway.app"
echo "• Render docs: render.com/docs" 
echo "• Copy/paste any error messages for help"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "💡 Tip: Initialize git repository:"
    echo "   git init"
    echo "   git add ."
    echo "   git commit -m 'Initial Brand Central deployment'"
    echo "   git branch -M main"
    echo ""
fi

echo "🎯 Ready to deploy!"
echo "   This fresh codebase is optimized for deployment success!"
echo ""
echo "🔗 Recommended: Try Railway first, then Render if issues occur"
