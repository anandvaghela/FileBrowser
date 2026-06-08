-- Migration script to fix column names
-- Run this if you don't want to restart the server

-- Fix global_folders table
ALTER TABLE global_folders RENAME COLUMN path TO folder_path;
ALTER TABLE global_folders DROP COLUMN name;

-- Fix user_items table  
ALTER TABLE user_items RENAME COLUMN path TO item_path;
