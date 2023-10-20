const User = require('../models/user');
const Post = require('../models/post');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = {
    createUser: async function({userInput}, req) {
        // const email = args.userInput.email
        const errors = [];
        if(!validator.isEmail(userInput.email)){
            errors.push({ message: 'Please enter a valid email' })
        }

        if(validator.isEmpty(userInput.password) || !validator.isLength(userInput.password, {min:5})){
            errors.push({message: 'Password must have up to 5 characters'})
        }

        if(errors.length > 0){
            const error = new Error('Invalid Input');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const existingUser = await User.findOne({email: userInput.email})

        if(existingUser){
            const error = new Error('User already exists!')
            throw error;
        }
        const hashedPw = await bcrypt.hash(userInput.password, 12);

        const user = new User({
            email: userInput.email,
            name: userInput.name,
            password: hashedPw
        });
        const createdUser = await user.save();
        return { ...createdUser._doc, _id: createdUser._id.toString() }
    },

    login: async function({ email, password }){
        const user = await User.findOne({ email: email });

        if(!user){
            const error = new Error('User not found,')
            error.code = 401;
            throw error;
        }

        const isEqual = await bcrypt.compare(password, user.password);
        if(!isEqual){
            const error = new Error('Wrong Password');
            error.code = 401;
            throw error;
        }

        const token = jwt.sign(
        {
            userId: user._id.toString(),
            email: user.email
        },
        'somesupersecretsecret',
        { expiresIn: '1h' }
        )
        return {token: token, userId: user._id.toString()}
    },

    createPost: async function({postInput}, req) {
        if(!req.isAuth){
            const error = new Error('Not Authorized');
            error.code = 401;
            throw error;
        }
        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })){
            errors.push({message: 'Title should have minimum of 5 characters'})
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })){
            errors.push({message: 'content should have minimum of 5 characters'})
        }
        if(errors.length > 0){
            const error = new Error('Invalid Input');
            error.data = errors;
            error.code = 422;
            throw error;
        }

        const user = await User.findById(req.userId)

        if(!user){
            const error = new Error('Invalid User');
            error.code = 401;
            throw error;
        }

        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            creator: user
        })

        const createdPost = await post.save();
        user.posts.push(createdPost);
        user.save();

        return { 
            ...createdPost._doc, _id: createdPost._id.toString(), 
            createdAt: createdPost.createdAt.toISOString(), 
            updatedAt: createdPost.updatedAt.toISOString()
        }
    },

    posts: async function({ page }, req){
        if(!req.isAuth){
            const error = new Error('Not authorized')
            error.code = 401;
            throw error;
        }

        if(!page){
            console.log('no page');
            page = 1;
        }
        
        const perPage = 2;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find()
        .sort({ createdAt: -1})
        .skip((page - 1)*perPage)
        .limit(perPage)
        .populate('creator');

        return {posts: posts.map(p => {
            return {...p._doc, _id: p._id.toString(), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString()}
        }), totalPosts: totalPosts}
    },

    post: async function({ id }, req) {
        if(!req.isAuth){
            const error = new Error('Unauthorized');
            error.code = 401;
            throw error;
        }

        const post = await Post.findById(id).populate('creator');
        if(!post){
            const error = new Error('No post found');
            error.code = 404;
            throw error;
        }

        return {
            ...post._doc,
            _id: post._id.toString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        }
    },

    updatePost: async function({ id, postInput }, req){
        if(!req.isAuth){
            const error = new Error('Unauthorized');
            error.code = 404;
            throw error;
        }

        const post = await Post.findById(id).populate('creator');

        if(!post){
            const error = new Error('No post found');
            error.code = 401;
            throw error;
        }

        if(post.creator._id.toString() !== req.userId.toString()){
            const error = new Error('Not authorized');
            error.code = 401;
            throw error;
        }

        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })){
            errors.push({message: 'Title should have minimum of 5 characters'})
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })){
            errors.push({message: 'content should have minimum of 5 characters'})
        }
        if(errors.length > 0){
            const error = new Error('Invalid Input');
            error.data = errors;
            error.code = 422;
            throw error;
        }

        post.title = postInput.title,
        post.content = postInput.content

        const updatedPost = await post.save();

        return {
            ...updatedPost._doc,
            _id: updatedPost._id.toString(),
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString()
        }
    },

    deletePost: async function({ id }, req){
        if (!req.isAuth) {
          const error = new Error('Unauthorized');
          error.code = 401;
          throw error;
        }
      
        const post = await Post.findById(id);
      
        if (!post) {
          const error = new Error('No post found');
          error.code = 404;
          throw error;
        }
      
        if (post.creator._id.toString() !== req.userId.toString()) {
          const error = new Error('Not authorized');
          error.code = 401;
          throw error;
        }
      
        await Post.findByIdAndRemove(id);
        const user = await User.findById(req.userId);
        user.posts.pull(id);
      
        await user.save();
        return true;
    },
    
    user: async function(args, req){
        if (!req.isAuth) {
            const error = new Error('Unauthorized');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);

        if(!user){
            const error = new Error('No user found');
            error.code = 404;
            throw error;
        }

        return {
            ...user._doc,
            _id: user._id.toString()
        }
    }
      
}