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
  const token = localStorage.getItem('rollodex_token');
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
      localStorage.removeItem('rollodex_token');
      localStorage.removeItem('rollodex_user');
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
    const token = localStorage.getItem('rollodex_token');
    const userData = localStorage.getItem('rollodex_user');
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('rollodex_token');
        localStorage.removeItem('rollodex_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user: userData } = response.data;
      
      localStorage.setItem('rollodex_token', token);
      localStorage.setItem('rollodex_user', JSON.stringify(userData));
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
      
      localStorage.setItem('rollodex_token', token);
      localStorage.setItem('rollodex_user', JSON.stringify(userData));
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
    localStorage.removeItem('rollodex_token');
    localStorage.removeItem('rollodex_user');
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
      <div className={`animate-spin rounded-full border-2 border-sage-500 border-t-transparent ${sizeClasses[size]}`}></div>
    </div>
  );
};

const Card = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-slate-200 ${className}`} {...props}>
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
  const baseClasses = 'font-medium rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 inline-flex items-center justify-center';
  
  const variants = {
    primary: 'bg-sage-600 hover:bg-sage-700 text-white focus:ring-sage-500 shadow-sm',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-900 focus:ring-slate-500',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500',
    ghost: 'hover:bg-slate-50 text-slate-700 focus:ring-slate-500'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm h-8',
    md: 'px-4 py-2 text-sm h-10',
    lg: 'px-6 py-3 text-base h-12'
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
      {loading && (
        <LoadingSpinner size="sm" />
      )}
      <span className={loading ? 'ml-2' : ''}>{children}</span>
    </button>
  );
};

const FileUpload = ({ onFileSelect, accept = "*/*", multiple = false, children }) => {
  const [dragOver, setDragOver] = useState(false);
  
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    onFileSelect(multiple ? files : files[0]);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    onFileSelect(multiple ? files : files[0]);
  };

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-6 text-center transition-colors
        ${dragOver 
          ? 'border-sage-400 bg-sage-50' 
          : 'border-slate-300 hover:border-slate-400'
        }
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInput}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        {children || (
          <div>
            <div className="text-4xl mb-2">📁</div>
            <p className="text-slate-600">
              Drop files here or <span className="text-sage-600 font-medium">browse</span>
            </p>
          </div>
        )}
      </label>
    </div>
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
      toast.success('Welcome to ROLLodex!');
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Montserrat']">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-br from-sage-500 to-sage-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
        </div>
        <h1 className="mt-6 text-center text-4xl font-bold text-slate-900">
          ROLLodex
        </h1>
        <p className="mt-2 text-center text-lg text-slate-600">
          The complete B2B platform for brand partnerships
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-4 sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-sm font-semibold text-slate-900">
                Email address
              </label>
              <input
                type="email"
                {...register('email', { required: 'Email is required' })}
                className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500 transition-colors"
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-rose-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900">
                Password
              </label>
              <input
                type="password"
                {...register('password', { required: 'Password is required' })}
                className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500 transition-colors"
                placeholder="Enter your password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-rose-600">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              Sign in to ROLLodex
            </Button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Try demo accounts</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3">
              <Button
                variant="ghost"
                onClick={() => demoLogin('retailer')}
                disabled={loading}
                className="w-full border border-slate-200"
              >
                🛒 Demo Retailer Account
              </Button>
              <Button
                variant="ghost"
                onClick={() => demoLogin('brand')}
                disabled={loading}
                className="w-full border border-slate-200"
              >
                🏷️ Demo Brand Account
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link to="/register" className="text-sm text-sage-600 hover:text-sage-500 font-medium">
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
      toast.success('Welcome to ROLLodex!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Montserrat']">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-br from-sage-500 to-sage-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-2xl">R</span>
          </div>
        </div>
        <h1 className="mt-6 text-center text-4xl font-bold text-slate-900">
          Join ROLLodex
        </h1>
        <p className="mt-2 text-center text-lg text-slate-600">
          Create your account today
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-4 sm:px-10">
          {/* Company Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-900 mb-3">
              Account Type
            </label>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setCompanyType('retailer')}
                className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
                  companyType === 'retailer'
                    ? 'bg-white text-sage-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                🛒 I'm a Retailer
              </button>
              <button
                type="button"
                onClick={() => setCompanyType('brand')}
                className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all ${
                  companyType === 'brand'
                    ? 'bg-white text-sage-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                🏷️ I'm a Brand
              </button>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  First Name
                </label>
                <input
                  type="text"
                  {...register('firstName', { required: 'First name is required' })}
                  className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-rose-600">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  Last Name
                </label>
                <input
                  type="text"
                  {...register('lastName', { required: 'Last name is required' })}
                  className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-rose-600">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900">
                Email
              </label>
              <input
                type="email"
                {...register('email', { required: 'Email is required' })}
                className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-rose-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900">
                Company Name
              </label>
              <input
                type="text"
                {...register('companyName', { required: 'Company name is required' })}
                className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-rose-600">{errors.companyName.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  {...register('phone')}
                  className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  {...register('title')}
                  className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900">
                Password
              </label>
              <input
                type="password"
                {...register('password', { 
                  required: 'Password is required',
                  minLength: { value: 6, message: 'Password must be at least 6 characters' }
                })}
                className="mt-2 block w-full px-3 py-3 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-rose-600">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              Create ROLLodex Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-sage-600 hover:text-sage-500 font-medium">
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
    <nav className="bg-white shadow-sm border-b border-slate-200 font-['Montserrat']">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-sage-500 to-sage-600 rounded-lg flex items-center justify-center shadow">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <span className="ml-3 text-2xl font-bold text-slate-900">
                ROLLodex
              </span>
            </Link>
            <div className="ml-10 flex space-x-1">
              <Link 
                to="/dashboard" 
                className="border-sage-500 text-sage-600 inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium"
              >
                📊 Dashboard
              </Link>
              {user?.role?.includes('retailer') && (
                <>
                  <Link 
                    to="/brands" 
                    className="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors"
                  >
                    🔍 Discover Brands
                  </Link>
                  <Link 
                    to="/relationships" 
                    className="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors"
                  >
                    🤝 My Partners
                  </Link>
                </>
              )}
              {user?.role?.includes('brand') && (
                <>
                  <Link 
                    to="/profile" 
                    className="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors"
                  >
                    🏷️ Brand Profile
                  </Link>
                  <Link 
                    to="/assets" 
                    className="border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 inline-flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors"
                  >
                    📁 Asset Library
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-500">{user?.companyName}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="border border-slate-200"
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
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsResponse, brandsResponse] = await Promise.all([
          api.get('/analytics/dashboard'),
          api.get('/brands?limit=5')
        ]);
        
        setStats(statsResponse.data.stats || {});
        setBrands(brandsResponse.data.brands || []);
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (dashboardLoading) {
    return (
      <div className="min-h-screen bg-slate-50 font-['Montserrat']">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-['Montserrat']">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            {user?.role?.includes('retailer') ? '🛒 Retailer Dashboard' : '🏷️ Brand Dashboard'}
          </h1>
          <p className="text-lg text-slate-600 mt-2">
            Welcome back, {user?.firstName}! Here's your ROLLodex overview.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-sage-100 rounded-lg flex items-center justify-center">
                <span className="text-sage-600 text-2xl">
                  {user?.role?.includes('retailer') ? '🤝' : '📊'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-slate-600">
                  {user?.role?.includes('retailer') ? 'Total Partnerships' : 'Profile Score'}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {user?.role?.includes('retailer') 
                    ? (stats.relationships?.active || 0) + (stats.relationships?.prospective || 0)
                    : '87%'
                  }
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <span className="text-emerald-600 text-2xl">
                  {user?.role?.includes('retailer') ? '✅' : '🏷️'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-slate-600">
                  {user?.role?.includes('retailer') ? 'Active Partners' : 'Retailer Partners'}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.relationships?.active || 23}
                </p>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 text-emerald-600 bg-emerald-50">
                  +12% this month
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-violet-100 rounded-lg flex items-center justify-center">
                <span className="text-violet-600 text-2xl">📁</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-slate-600">
                  {user?.role?.includes('retailer') ? 'Assets Downloaded' : 'Total Assets'}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {user?.role?.includes('retailer') 
                    ? stats.totalDownloads || 156
                    : stats.totalAssets || 42
                  }
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <span className="text-amber-600 text-2xl">
                  {user?.role?.includes('retailer') ? '⏳' : '📈'}
                </span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-slate-600">
                  {user?.role?.includes('retailer') ? 'Pending Requests' : 'Asset Downloads'}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {user?.role?.includes('retailer') 
                    ? stats.relationships?.prospective || 8
                    : stats.totalDownloads || 287
                  }
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              {user?.role?.includes('retailer') ? 'Recent Brand Activity' : 'Partnership Overview'}
            </h2>
            <Button size="sm" variant="ghost" className="border border-slate-200">
              {user?.role?.includes('retailer') ? 'View All Brands' : 'Manage Profile'}
            </Button>
          </div>

          {brands.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-slate-400 text-3xl">🏷️</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {user?.role?.includes('retailer') ? 'No brands yet' : 'Getting started'}
              </h3>
              <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                {user?.role?.includes('retailer') 
                  ? 'Start exploring brands to build your partnerships'
                  : 'Complete your brand profile to attract retailer partners'
                }
              </p>
              <Button>
                {user?.role?.includes('retailer') ? '🔍 Discover Brands' : '🏷️ Complete Profile'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {brands.slice(0, 3).map((brand, index) => (
                <div key={brand.id || index} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-sage-100 to-sage-200 rounded-lg flex items-center justify-center">
                      <span className="text-sage-600 font-bold text-lg">
                        {brand.name ? brand.name.charAt(0) : 'B'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {brand.name || 'Brand Name'}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {brand.industry || 'Industry'} • {brand.product_count || 0} products
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {brand.profile_completion_score || 85}% complete
                      </p>
                      <p className="text-sm text-slate-500">
                        {brand.relationship_count || 0} partnerships
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="border border-slate-200">
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

// Brands Discovery Page - FIXED VERSION
const BrandsPage = () => {
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');

  useEffect(() => {
    const fetchBrands = async () => {
      setBrandsLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (industryFilter) params.append('industry', industryFilter);
        
        const response = await api.get(`/brands?${params}`);
        setBrands(response.data.brands || []);
      } catch (error) {
        console.error('Brands fetch error:', error);
        toast.error('Failed to load brands');
      } finally {
        setBrandsLoading(false);
      }
    };

    fetchBrands();
  }, [searchTerm, industryFilter]);

  return (
    <div className="min-h-screen bg-slate-50 font-['Montserrat']">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🔍 Discover Brands</h1>
          <p className="text-lg text-slate-600 mt-2">
            Find and connect with brand partners for your business
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search brands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              />
            </div>
            <div className="md:w-48">
              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
              >
                <option value="">All Industries</option>
                <option value="Natural Foods">Natural Foods</option>
                <option value="Food Technology">Food Technology</option>
                <option value="Beauty">Beauty</option>
                <option value="Fashion">Fashion</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Brands Grid */}
        {brandsLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {brands.map((brand, index) => (
              <Card key={brand.id || index} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-sage-100 to-sage-200 rounded-lg flex items-center justify-center">
                    <span className="text-sage-600 font-bold text-xl">
                      {brand.name ? brand.name.charAt(0) : 'B'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {brand.name || 'Brand Name'}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {brand.industry || 'Industry'}
                    </p>
                  </div>
                </div>
                
                <p className="text-slate-600 text-sm mb-4 line-clamp-3">
                  {brand.description || 'No description available'}
                </p>
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-sage-100 text-sage-700">
                      {brand.product_count || 0} products
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {brand.profile_completion_score || 85}% complete
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" className="border border-slate-200">
                    View Profile
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

// Asset Library Page (for brands)
const AssetsPage = () => {
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    const formData = new FormData();
    
    if (Array.isArray(files)) {
      files.forEach(file => formData.append('files', file));
    } else {
      formData.append('files', files);
    }
    
    formData.append('description', 'Brand asset');
    formData.append('category', 'marketing');
    formData.append('permission_level', 'partners_only');

    try {
      const response = await api.post('/brands/1/assets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Files uploaded successfully!');
      setAssets(prev => [...prev, ...response.data.assets]);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-['Montserrat']">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">📁 Asset Library</h1>
          <p className="text-lg text-slate-600 mt-2">
            Upload and manage your brand assets and marketing materials
          </p>
        </div>

        {/* Upload Section */}
        <Card className="p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Upload New Assets</h2>
          <FileUpload 
            onFileSelect={handleFileUpload} 
            multiple={true}
            accept="image/*,.pdf,.doc,.docx"
          >
            <div className={uploading ? 'opacity-50' : ''}>
              <div className="text-4xl mb-4">📁</div>
              <p className="text-slate-600 text-lg">
                {uploading ? 'Uploading...' : 'Drop files here or click to browse'}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Supports: Images, PDFs, Word documents
              </p>
            </div>
          </FileUpload>
        </Card>

        {/* Assets Grid */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-6">Your Assets</h2>
          
          {assets.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No assets uploaded yet
              </h3>
              <p className="text-slate-500">
                Upload your first marketing materials to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset, index) => (
                <div key={asset.id || index} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">📄</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-sage-100 text-sage-700">
                      {asset.permission_level}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {asset.original_name}
                  </h3>
                  <p className="text-sm text-slate-500 mb-3">
                    {asset.download_count || 0} downloads
                  </p>
                  <Button size="sm" variant="ghost" className="w-full border border-slate-200">
                    Manage Asset
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

// Relationships Page (for retailers)
const RelationshipsPage = () => {
  const [relationships, setRelationships] = useState([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(true);

  useEffect(() => {
    const fetchRelationships = async () => {
      try {
        const response = await api.get('/relationships');
        setRelationships(response.data.relationships || []);
      } catch (error) {
        console.error('Relationships fetch error:', error);
        toast.error('Failed to load relationships');
      } finally {
        setRelationshipsLoading(false);
      }
    };

    fetchRelationships();
  }, []);

  if (relationshipsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 font-['Montserrat']">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-['Montserrat']">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🤝 My Partners</h1>
          <p className="text-lg text-slate-600 mt-2">
            Manage your brand partnerships and relationships
          </p>
        </div>

        <Card className="p-6">
          {relationships.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🤝</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                No partnerships yet
              </h3>
              <p className="text-slate-500 mb-6">
                Start discovering brands to build your first partnerships
              </p>
              <Button>
                🔍 Discover Brands
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {relationships.map((relationship, index) => (
                <div key={relationship.id || index} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-sage-100 to-sage-200 rounded-lg flex items-center justify-center">
                      <span className="text-sage-600 font-bold text-lg">
                        {relationship.brand_name ? relationship.brand_name.charAt(0) : 'B'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {relationship.brand_name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {relationship.industry} • {relationship.partnership_type || 'Partnership'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`
                      px-3 py-1 rounded-full text-sm font-medium
                      ${relationship.status === 'active' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                      }
                    `}>
                      {relationship.status}
                    </span>
                    <Button size="sm" variant="ghost" className="border border-slate-200">
                      Manage
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

// Brand Profile Page
const ProfilePage = () => {
  const [profile, setProfile] = useState({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/users/profile');
        setProfile(response.data.user || {});
      } catch (error) {
        console.error('Profile fetch error:', error);
        toast.error('Failed to load profile');
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 font-['Montserrat']">
        <Navigation />
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-['Montserrat']">
      <Navigation />
      
      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🏷️ Brand Profile</h1>
          <p className="text-lg text-slate-600 mt-2">
            Manage your brand information and settings
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Info */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">Profile Information</h2>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="border border-slate-200"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? 'Cancel' : 'Edit Profile'}
                </Button>
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        defaultValue={profile.firstName}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        defaultValue={profile.lastName}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sage-500 focus:border-sage-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 mt-6">
                    <Button>Save Changes</Button>
                    <Button variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-600">Company Name</label>
                    <p className="text-lg text-slate-900">{profile.companyName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-600">First Name</label>
                      <p className="text-lg text-slate-900">{profile.firstName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-600">Last Name</label>
                      <p className="text-lg text-slate-900">{profile.lastName}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-600">Email</label>
                    <p className="text-lg text-slate-900">{profile.email}</p>
                  </div>
                  {profile.phone && (
                    <div>
                      <label className="text-sm font-semibold text-slate-600">Phone</label>
                      <p className="text-lg text-slate-900">{profile.phone}</p>
                    </div>
                  )}
                  {profile.title && (
                    <div>
                      <label className="text-sm font-semibold text-slate-600">Title</label>
                      <p className="text-lg text-slate-900">{profile.title}</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Profile Completion */}
          <div>
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Profile Completion</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 bg-slate-200 rounded-full h-2">
                  <div className="bg-sage-500 h-2 rounded-full" style={{width: '87%'}}></div>
                </div>
                <span className="text-sm font-semibold text-slate-900">87%</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Basic Info</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="flex justify-between">
                  <span>Company Details</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="flex justify-between">
                  <span>Logo Upload</span>
                  <span className="text-slate-400">○</span>
                </div>
                <div className="flex justify-between">
                  <span>Product Catalog</span>
                  <span className="text-emerald-600">✓</span>
                </div>
              </div>
              <Button className="w-full mt-4" size="sm">
                Complete Profile
              </Button>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
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
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
            
            :root {
              --color-sage-50: #f0f4f1;
              --color-sage-100: #d8e5db;
              --color-sage-200: #b3ccb8;
              --color-sage-300: #8eb395;
              --color-sage-400: #699a72;
              --color-sage-500: #527767;
              --color-sage-600: #42615a;
              --color-sage-700: #324b4d;
              --color-sage-800: #223540;
              --color-sage-900: #121f33;
            }
            
            .text-sage-50 { color: var(--color-sage-50); }
            .text-sage-100 { color: var(--color-sage-100); }
            .text-sage-200 { color: var(--color-sage-200); }
            .text-sage-300 { color: var(--color-sage-300); }
            .text-sage-400 { color: var(--color-sage-400); }
            .text-sage-500 { color: var(--color-sage-500); }
            .text-sage-600 { color: var(--color-sage-600); }
            .text-sage-700 { color: var(--color-sage-700); }
            .text-sage-800 { color: var(--color-sage-800); }
            .text-sage-900 { color: var(--color-sage-900); }
            
            .bg-sage-50 { background-color: var(--color-sage-50); }
            .bg-sage-100 { background-color: var(--color-sage-100); }
            .bg-sage-200 { background-color: var(--color-sage-200); }
            .bg-sage-300 { background-color: var(--color-sage-300); }
            .bg-sage-400 { background-color: var(--color-sage-400); }
            .bg-sage-500 { background-color: var(--color-sage-500); }
            .bg-sage-600 { background-color: var(--color-sage-600); }
            .bg-sage-700 { background-color: var(--color-sage-700); }
            .bg-sage-800 { background-color: var(--color-sage-800); }
            .bg-sage-900 { background-color: var(--color-sage-900); }
            
            .border-sage-50 { border-color: var(--color-sage-50); }
            .border-sage-100 { border-color: var(--color-sage-100); }
            .border-sage-200 { border-color: var(--color-sage-200); }
            .border-sage-300 { border-color: var(--color-sage-300); }
            .border-sage-400 { border-color: var(--color-sage-400); }
            .border-sage-500 { border-color: var(--color-sage-500); }
            .border-sage-600 { border-color: var(--color-sage-600); }
            .border-sage-700 { border-color: var(--color-sage-700); }
            .border-sage-800 { border-color: var(--color-sage-800); }
            .border-sage-900 { border-color: var(--color-sage-900); }
            
            .hover\\:bg-sage-50:hover { background-color: var(--color-sage-50); }
            .hover\\:bg-sage-100:hover { background-color: var(--color-sage-100); }
            .hover\\:bg-sage-200:hover { background-color: var(--color-sage-200); }
            .hover\\:bg-sage-300:hover { background-color: var(--color-sage-300); }
            .hover\\:bg-sage-400:hover { background-color: var(--color-sage-400); }
            .hover\\:bg-sage-500:hover { background-color: var(--color-sage-500); }
            .hover\\:bg-sage-600:hover { background-color: var(--color-sage-600); }
            .hover\\:bg-sage-700:hover { background-color: var(--color-sage-700); }
            .hover\\:bg-sage-800:hover { background-color: var(--color-sage-800); }
            .hover\\:bg-sage-900:hover { background-color: var(--color-sage-900); }
            
            .focus\\:ring-sage-500:focus { 
              --tw-ring-color: var(--color-sage-500); 
            }
            
            .line-clamp-3 {
              display: -webkit-box;
              -webkit-line-clamp: 3;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
          `}</style>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/brands" element={
              <ProtectedRoute>
                <BrandsPage />
              </ProtectedRoute>
            } />
            <Route path="/assets" element={
              <ProtectedRoute>
                <AssetsPage />
              </ProtectedRoute>
            } />
            <Route path="/relationships" element={
              <ProtectedRoute>
                <RelationshipsPage />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster 
            position="top-right" 
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#fff',
                fontFamily: 'Montserrat, sans-serif'
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
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
