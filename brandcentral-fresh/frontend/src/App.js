import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import toast, { Toaster } from 'react-hot-toast';

// API Configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('brandcentral_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('brandcentral_token');
      localStorage.removeItem('brandcentral_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('brandcentral_token');
    const userData = localStorage.getItem('brandcentral_user');
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('brandcentral_token');
        localStorage.removeItem('brandcentral_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user: userData } = response.data;
      
      localStorage.setItem('brandcentral_token', token);
      localStorage.setItem('brandcentral_user', JSON.stringify(userData));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(userData);
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  };

  const register = async (data) => {
    try {
      const response = await api.post('/auth/register', data);
      const { token, user: userData } = response.data;
      
      localStorage.setItem('brandcentral_token', token);
      localStorage.setItem('brandcentral_user', JSON.stringify(userData));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      setUser(userData);
      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('brandcentral_token');
    localStorage.removeItem('brandcentral_user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// Utility Components
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  };

  return (
    <div className="flex items-center justify-center">
      <div className={`animate-spin rounded-full border-2 border-blue-500 border-t-transparent ${sizeClasses[size]}`}></div>
    </div>
  );
};

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-lg shadow border border-gray-200 ${className}`} {...props}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  loading = false,
  className = '',
  ...props 
}) => {
  const baseClasses = 'font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500',
    success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 focus:ring-gray-500'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const classes = `
    ${baseClasses}
    ${variants[variant]}
    ${sizes[size]}
    ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `;

  return (
    <button 
      className={classes} 
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="flex items-center gap-2">
          <LoadingSpinner size="sm" />
          {children}
        </div>
      ) : children}
    </button>
  );
};

// Login Page
const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data) => {
    setLoading(true);
    const result = await login(data.email, data.password);
    
    if (result.success) {
      toast.success('Welcome to Brand Central!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  const demoLogin = async (type) => {
    const email = type === 'retailer' 
      ? 'admin@freshmarket.example.com' 
      : 'admin@pureelements.example.com';
    
    setLoading(true);
    const result = await login(email, 'password123');
    
    if (result.success) {
      toast.success(`Welcome ${type}!`);
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">BC</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          Brand Central
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          The complete B2B platform for brand-retailer partnerships
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-4 sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                type="email"
                {...register('email', { required: 'Email is required' })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                {...register('password', { required: 'Password is required' })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
            >
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Try demo accounts</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <Button
                variant="outline"
                onClick={() => demoLogin('retailer')}
                disabled={loading}
                className="w-full"
              >
                🛒 Demo Retailer Account
              </Button>
              <Button
                variant="outline"
                onClick={() => demoLogin('brand')}
                disabled={loading}
                className="w-full"
              >
                🏷️ Demo Brand Account
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link to="/register" className="text-sm text-blue-600 hover:text-blue-500">
              Don't have an account? Sign up
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Registration Page
const RegisterPage = () => {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [companyType, setCompanyType] = useState('retailer');

  const onSubmit = async (data) => {
    setLoading(true);
    const result = await registerUser({
      ...data,
      companyType
    });
    
    if (result.success) {
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">BC</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Join the Brand Central platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-4 sm:px-10">
          {/* Company Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account Type
            </label>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setCompanyType('retailer')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  companyType === 'retailer'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                🛒 I'm a Retailer
              </button>
              <button
                type="button"
                onClick={() => setCompanyType('brand')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  companyType === 'brand'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                🏷️ I'm a Brand
              </button>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  type="text"
                  {...register('firstName', { required: 'First name is required' })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  type="text"
                  {...register('lastName', { required: 'Last name is required' })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                {...register('email', { required: 'Email is required' })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Company Name
              </label>
              <input
                type="text"
                {...register('companyName', { required: 'Company name is required' })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-red-600">{errors.companyName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  {...register('phone')}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  {...register('title')}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                {...register('password', { 
                  required: 'Password is required',
                  minLength: { value: 6, message: 'Password must be at least 6 characters' }
                })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
            >
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-blue-600 hover:text-blue-500">
              Already have an account? Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Navigation Component
const Navigation = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <nav className="bg-white shadow border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow">
                <span className="text-white font-bold text-sm">BC</span>
              </div>
              <span className="ml-3 text-xl font-semibold text-gray-900">
                Brand Central
              </span>
            </Link>
            <div className="ml-8 flex space-x-4">
              <Link 
                to="/dashboard" 
                className="border-blue-500 text-blue-600 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Dashboard
              </Link>
              {user?.role?.includes('retailer') && (
                <>
                  <Link 
                    to="/brands" 
                    className="border-transparent text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Discover Brands
                  </Link>
                  <Link 
                    to="/relationships" 
                    className="border-transparent text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    My Partners
                  </Link>
                </>
              )}
              {user?.role?.includes('brand') && (
                <>
                  <Link 
                    to="/profile" 
                    className="border-transparent text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Brand Profile
                  </Link>
                  <Link 
                    to="/assets" 
                    className="border-transparent text-gray-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    Asset Library
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-700 font-medium">
              Welcome, {user?.firstName}! 
              <span className="text-sm text-gray-500 ml-1">({user?.companyName})</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

// Dashboard Component
const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, brandsResponse] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/brands?limit=5')
      ]);
      
      setStats(statsResponse.data.stats);
      setBrands(brandsResponse.data.brands || []);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {user?.role?.includes('retailer') ? 'Retailer Dashboard' : 'Brand Dashboard'}
          </h1>
          <p className="text-gray-600 mt-2">
            Welcome back, {user?.firstName}! Here's your latest activity and insights.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-semibold">
                  {user?.role?.includes('retailer') ? '🤝' : '📊'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {user?.role?.includes('retailer') ? 'Total Partnerships' : 'Profile Score'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {user?.role?.includes('retailer') 
                    ? (stats.relationships?.active || 0) + (stats.relationships?.prospective || 0)
                    : '85%'
                  }
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 font-semibold">
                  {user?.role?.includes('retailer') ? '✅' : '🏷️'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {user?.role?.includes('retailer') ? 'Active Partners' : 'Retailer Partners'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {user?.role?.includes('retailer') 
                    ? stats.relationships?.active || 0
                    : stats.relationships?.active || 0
                  }
                </p>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 text-green-600 bg-green-50">
                  +12% this month
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 font-semibold">📁</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {user?.role?.includes('retailer') ? 'Downloaded Assets' : 'Total Assets'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {user?.role?.includes('retailer') 
                    ? stats.totalDownloads || 0
                    : stats.totalAssets || 0
                  }
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <span className="text-yellow-600 font-semibold">
                  {user?.role?.includes('retailer') ? '⏳' : '📈'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {user?.role?.includes('retailer') ? 'Pending Requests' : 'Asset Downloads'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {user?.role?.includes('retailer') 
                    ? stats.relationships?.prospective || 0
                    : stats.totalDownloads || 0
                  }
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Brand Highlights */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {user?.role?.includes('retailer') ? 'Recent Brand Activity' : 'Platform Overview'}
            </h2>
            <Button size="sm">
              {user?.role?.includes('retailer') ? 'View All Brands' : 'Manage Profile'}
            </Button>
          </div>

          {brands.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-gray-400 text-2xl">🏷️</span>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {user?.role?.includes('retailer') ? 'No brands yet' : 'Getting started'}
              </h3>
              <p className="text-gray-500 mb-4">
                {user?.role?.includes('retailer') 
                  ? 'Start exploring brands to build your partnerships'
                  : 'Complete your brand profile to attract retailer partners'
                }
              </p>
              <Button>
                {user?.role?.includes('retailer') ? 'Discover Brands' : 'Complete Profile'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {brands.slice(0, 3).map((brand, index) => (
                <div key={brand.id || index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-lg">
                        {brand.name ? brand.name.charAt(0) : 'B'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {brand.name || 'Brand Name'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {brand.industry || 'Industry'} • {brand.product_count || 0} products
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {brand.profile_completion_score || 0}% complete
                      </p>
                      <p className="text-sm text-gray-500">
                        {brand.relationship_count || 0} partnerships
                      </p>
                    </div>
                    <Button size="sm" variant="outline">
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster 
            position="top-right" 
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
